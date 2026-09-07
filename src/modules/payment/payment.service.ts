import { BookingStatus, PaymentGateway, PaymentStatus, Role } from "@prisma/client";
import httpStatus from "http-status";
import type Stripe from "stripe";
import type { z } from "zod";
import config from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { StripeGateway } from "./gateways/stripe.gateway.js";
import type { initiatePaymentSchema } from "./payment.schema.js";

type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

const paymentSelect = {
	id: true,
	userId: true,
	bookingId: true,
	amount: true,
	currency: true,
	gateway: true,
	status: true,
	gatewayPaymentId: true,
	transactionId: true,
	merchantReference: true,
	createdAt: true,
	updatedAt: true,
} as const;

const getGateway = (gateway: PaymentGateway) => {
	if (gateway === PaymentGateway.STRIPE) {
		return new StripeGateway();
	}

	throw new AppError(
		httpStatus.NOT_IMPLEMENTED,
		"bKash gateway is not implemented yet. Use STRIPE.",
	);
};

const initiatePayment = async (user: AuthUser, payload: InitiatePaymentInput) => {
	if (user.role !== Role.TENANT && user.role !== Role.ADMIN) {
		throw new AppError(httpStatus.FORBIDDEN, "Only tenants can initiate payments");
	}

	if (payload.gateway !== PaymentGateway.STRIPE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only STRIPE is currently supported. bKash is future-ready only.",
		);
	}

	const booking = await prisma.booking.findFirst({
		where: {
			id: payload.bookingId,
			deletedAt: null,
		},
		include: {
			tenant: true,
			property: true,
		},
	});

	if (!booking) {
		throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
	}

	if (booking.tenantId !== user.id && user.role !== Role.ADMIN) {
		throw new AppError(httpStatus.FORBIDDEN, "You can only pay for your own bookings");
	}

	if (booking.status !== BookingStatus.PENDING_PAYMENT) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Booking is not payable. Current status: ${booking.status}`,
		);
	}

	const existingPaid = await prisma.payment.findFirst({
		where: {
			bookingId: booking.id,
			status: PaymentStatus.PAID,
		},
	});

	if (existingPaid) {
		throw new AppError(httpStatus.CONFLICT, "Booking is already paid");
	}

	const amount = Number(booking.rentAmount);
	const merchantReference = `booking_${booking.id}_${Date.now()}`;
	const gateway = getGateway(payload.gateway);

	const checkout = await gateway.createCheckoutSession({
		amount,
		currency: "usd",
		merchantReference,
		customerEmail: booking.tenant.email,
		successUrl: config.stripe.successUrl,
		cancelUrl: config.stripe.cancelUrl,
		metadata: {
			bookingId: booking.id,
			userId: booking.tenantId,
			merchantReference,
		},
	});

	const payment = await prisma.payment.create({
		data: {
			userId: booking.tenantId,
			bookingId: booking.id,
			amount,
			currency: "usd",
			gateway: PaymentGateway.STRIPE,
			status: PaymentStatus.PENDING,
			gatewayPaymentId: checkout.gatewayPaymentId,
			merchantReference,
			metadata: {
				checkoutUrl: checkout.checkoutUrl,
			},
		},
		select: paymentSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "PAYMENT_INITIATED",
		entity: "Payment",
		entityId: payment.id,
		metadata: { bookingId: booking.id, gateway: PaymentGateway.STRIPE },
	});

	return {
		payment,
		checkoutUrl: checkout.checkoutUrl,
	};
};

const handleStripeWebhook = async (rawBody: Buffer, signature: string | undefined) => {
	if (!signature) {
		throw new AppError(httpStatus.BAD_REQUEST, "Missing Stripe signature");
	}

	const gateway = new StripeGateway();
	let event: Stripe.Event;

	try {
		event = gateway.constructWebhookEvent(rawBody, signature);
	} catch {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid Stripe webhook signature");
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;
		await markPaymentPaidFromSession(session);
	}

	if (event.type === "checkout.session.expired") {
		const session = event.data.object as Stripe.Checkout.Session;
		await markPaymentFailedOrCancelled(session.id, PaymentStatus.CANCELLED);
	}

	if (event.type === "payment_intent.payment_failed") {
		const intent = event.data.object as Stripe.PaymentIntent;
		const payment = await prisma.payment.findFirst({
			where: {
				OR: [{ gatewayPaymentId: intent.id }, { transactionId: intent.id }],
			},
		});
		if (payment && payment.status === PaymentStatus.PENDING) {
			await prisma.payment.update({
				where: { id: payment.id },
				data: { status: PaymentStatus.FAILED },
			});
		}
	}

	return { received: true, type: event.type };
};

const markPaymentPaidFromSession = async (session: Stripe.Checkout.Session) => {
	const sessionId = session.id;
	const bookingId = session.metadata?.bookingId;
	const merchantReference = session.client_reference_id ?? session.metadata?.merchantReference;

	const payment = await prisma.payment.findFirst({
		where: {
			OR: [{ gatewayPaymentId: sessionId }, ...(merchantReference ? [{ merchantReference }] : [])],
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment record not found for Stripe session");
	}

	if (payment.status === PaymentStatus.PAID) {
		return payment;
	}

	const expectedAmountCents = Math.round(Number(payment.amount) * 100);
	if (session.amount_total !== null && session.amount_total !== expectedAmountCents) {
		throw new AppError(httpStatus.CONFLICT, "Paid amount does not match booking amount");
	}

	if (bookingId && payment.bookingId !== bookingId) {
		throw new AppError(httpStatus.CONFLICT, "Booking mismatch in Stripe metadata");
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedPayment = await tx.payment.update({
			where: { id: payment.id },
			data: {
				status: PaymentStatus.PAID,
				transactionId: typeof session.payment_intent === "string" ? session.payment_intent : null,
				gatewayPaymentId: session.id,
			},
			select: paymentSelect,
		});

		await tx.booking.update({
			where: { id: payment.bookingId },
			data: { status: BookingStatus.CONFIRMED },
		});

		await tx.auditLog.create({
			data: {
				userId: payment.userId,
				action: "PAYMENT_PAID",
				entity: "Payment",
				entityId: payment.id,
				metadata: { stripeSessionId: session.id },
			},
		});

		return updatedPayment;
	});

	return result;
};

const markPaymentFailedOrCancelled = async (sessionId: string, status: PaymentStatus) => {
	const payment = await prisma.payment.findFirst({
		where: { gatewayPaymentId: sessionId, status: PaymentStatus.PENDING },
	});

	if (!payment) {
		return null;
	}

	return prisma.payment.update({
		where: { id: payment.id },
		data: { status },
		select: paymentSelect,
	});
};

const getMyPayments = async (user: AuthUser) => {
	return prisma.payment.findMany({
		where: { userId: user.id },
		select: paymentSelect,
		orderBy: { createdAt: "desc" },
	});
};

const getPaymentById = async (paymentId: string, user: AuthUser) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		select: {
			...paymentSelect,
			booking: {
				select: {
					id: true,
					tenantId: true,
					property: { select: { ownerId: true } },
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	}

	const isTenant = payment.userId === user.id;
	const isLandlord = payment.booking.property.ownerId === user.id;

	if (user.role !== Role.ADMIN && !isTenant && !isLandlord) {
		throw new AppError(httpStatus.FORBIDDEN, "You cannot access this payment");
	}

	return payment;
};

export const PaymentService = {
	initiatePayment,
	handleStripeWebhook,
	getMyPayments,
	getPaymentById,
};
