import type { Payment, Prisma } from "@prisma/client";
import { BookingStatus, PaymentGateway, PaymentStatus, Role } from "@prisma/client";
import httpStatus from "http-status";
import type Stripe from "stripe";
import type { z } from "zod";
import config from "../../config/index.js";
import { getBkashIdToken } from "../../lib/bkash.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { BkashGateway, toBkashAmount } from "./gateways/bkash.gateway.js";
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

const paymentWithBookingSelect = {
	...paymentSelect,
	booking: {
		select: {
			id: true,
			tenantId: true,
			status: true,
			rentAmount: true,
			startDate: true,
			endDate: true,
			property: { select: { id: true, title: true, city: true, ownerId: true } },
			room: { select: { id: true, name: true } },
		},
	},
} as const;

const getGateway = (gateway: PaymentGateway) => {
	if (gateway === PaymentGateway.STRIPE) {
		return new StripeGateway();
	}
	if (gateway === PaymentGateway.BKASH) {
		return new BkashGateway();
	}
	throw new AppError(httpStatus.BAD_REQUEST, "Unsupported payment gateway");
};

/**
 * Marks a payment PAID and confirms its booking in one transaction.
 * The booking is only confirmed while it is still PENDING_PAYMENT; otherwise the money was
 * received for a cancelled/already-paid booking and an audit entry flags it for a manual refund.
 */
const finalizePaidPayment = async (
	payment: Payment,
	data: Prisma.PaymentUpdateManyMutationInput,
	auditMetadata: Prisma.InputJsonObject,
) => {
	return prisma.$transaction(async (tx) => {
		const updated = await tx.payment.updateMany({
			where: { id: payment.id, status: { not: PaymentStatus.PAID } },
			data: { ...data, status: PaymentStatus.PAID },
		});

		if (updated.count === 0) {
			return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, select: paymentSelect });
		}

		const confirmed = await tx.booking.updateMany({
			where: { id: payment.bookingId, status: BookingStatus.PENDING_PAYMENT, deletedAt: null },
			data: { status: BookingStatus.CONFIRMED },
		});

		await tx.auditLog.create({
			data: {
				userId: payment.userId,
				action: "PAYMENT_PAID",
				entity: "Payment",
				entityId: payment.id,
				metadata: { ...auditMetadata, bookingConfirmed: confirmed.count === 1 },
			},
		});

		if (confirmed.count !== 1) {
			const booking = await tx.booking.findUnique({
				where: { id: payment.bookingId },
				select: { status: true },
			});
			await tx.auditLog.create({
				data: {
					userId: payment.userId,
					action: "PAYMENT_REQUIRES_REFUND",
					entity: "Payment",
					entityId: payment.id,
					metadata: { bookingId: payment.bookingId, bookingStatus: booking?.status ?? null },
				},
			});
		}

		return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, select: paymentSelect });
	});
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

	return finalizePaidPayment(
		payment,
		{
			transactionId: typeof session.payment_intent === "string" ? session.payment_intent : null,
			gatewayPaymentId: session.id,
		},
		{ stripeSessionId: session.id },
	);
};

const markStripeSessionStatus = async (
	sessionId: string,
	status: typeof PaymentStatus.FAILED | typeof PaymentStatus.CANCELLED,
) => {
	await prisma.payment.updateMany({
		where: { gatewayPaymentId: sessionId, status: PaymentStatus.PENDING },
		data: { status },
	});
};

/**
 * Closes every unfinished checkout for a booking so an old tab cannot charge the tenant twice.
 * Returns true when one of those checkouts turns out to be already paid.
 * In strict mode a Stripe error aborts (used before creating a new checkout).
 */
const supersedeOpenCheckouts = async (bookingId: string, strict: boolean) => {
	const open = await prisma.payment.findMany({
		where: {
			bookingId,
			OR: [
				{ status: PaymentStatus.PENDING },
				{ status: PaymentStatus.FAILED, gateway: PaymentGateway.STRIPE },
			],
		},
	});

	let foundPaid = false;
	let stripe: StripeGateway | undefined;

	for (const payment of open) {
		if (payment.gateway === PaymentGateway.STRIPE && payment.gatewayPaymentId) {
			try {
				stripe ??= new StripeGateway();
				const session = await stripe.retrieveSession(payment.gatewayPaymentId);
				if (session.payment_status === "paid") {
					await markPaymentPaidFromSession(session);
					foundPaid = true;
					continue;
				}
				if (session.status === "open") {
					await stripe.expireSession(session.id);
				}
			} catch (error) {
				if (strict) {
					throw error instanceof AppError
						? error
						: new AppError(
								httpStatus.BAD_GATEWAY,
								"Could not close the previous Stripe checkout. Please try again.",
							);
				}
				console.warn(`Could not expire Stripe session for payment ${payment.id}:`, error);
			}
		}

		if (payment.status === PaymentStatus.PENDING) {
			await prisma.payment.updateMany({
				where: { id: payment.id, status: PaymentStatus.PENDING },
				data: { status: PaymentStatus.CANCELLED },
			});
		}
	}

	return foundPaid;
};

const initiatePayment = async (user: AuthUser, payload: InitiatePaymentInput) => {
	if (user.role !== Role.TENANT && user.role !== Role.ADMIN) {
		throw new AppError(httpStatus.FORBIDDEN, "Only tenants can initiate payments");
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

	if (await supersedeOpenCheckouts(booking.id, true)) {
		throw new AppError(httpStatus.CONFLICT, "Booking is already paid");
	}

	const amount = Number(booking.rentAmount);
	const merchantReference = `booking_${booking.id}_${Date.now()}`.slice(0, 255);
	const selectedGateway = payload.gateway ?? PaymentGateway.STRIPE;
	const gateway = getGateway(selectedGateway);
	const currency = selectedGateway === PaymentGateway.BKASH ? "bdt" : config.stripe.currency;

	const checkout = await gateway.createCheckoutSession({
		amount,
		currency,
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
			currency,
			gateway: selectedGateway,
			status: PaymentStatus.PENDING,
			gatewayPaymentId: checkout.gatewayPaymentId,
			merchantReference,
			metadata: {
				checkoutUrl: checkout.checkoutUrl,
				gatewayRaw: checkout.raw ?? null,
			},
		},
		select: paymentSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "PAYMENT_INITIATED",
		entity: "Payment",
		entityId: payment.id,
		metadata: { bookingId: booking.id, gateway: selectedGateway },
	});

	return {
		payment,
		checkoutUrl: checkout.checkoutUrl,
	};
};

const findPaymentForIntent = async (stripe: StripeGateway, intent: Stripe.PaymentIntent) => {
	const merchantReference = intent.metadata?.merchantReference;
	if (merchantReference) {
		const byReference = await prisma.payment.findFirst({ where: { merchantReference } });
		if (byReference) {
			return byReference;
		}
	}

	// Sessions created before payment_intent_data.metadata was added carry no metadata on the intent
	const sessionId = await stripe.findSessionIdByPaymentIntent(intent.id).catch(() => undefined);
	return prisma.payment.findFirst({
		where: {
			OR: [...(sessionId ? [{ gatewayPaymentId: sessionId }] : []), { transactionId: intent.id }],
		},
	});
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

	switch (event.type) {
		case "checkout.session.completed": {
			// Delayed payment methods complete with "unpaid" and settle via async_payment_succeeded
			if (event.data.object.payment_status === "paid") {
				await markPaymentPaidFromSession(event.data.object);
			}
			break;
		}
		case "checkout.session.async_payment_succeeded":
			await markPaymentPaidFromSession(event.data.object);
			break;
		case "checkout.session.async_payment_failed":
			await markStripeSessionStatus(event.data.object.id, PaymentStatus.FAILED);
			break;
		case "checkout.session.expired":
			await markStripeSessionStatus(event.data.object.id, PaymentStatus.CANCELLED);
			break;
		case "payment_intent.payment_failed": {
			const payment = await findPaymentForIntent(gateway, event.data.object);
			if (payment) {
				await prisma.payment.updateMany({
					where: { id: payment.id, status: PaymentStatus.PENDING },
					data: { status: PaymentStatus.FAILED },
				});
			}
			break;
		}
		default:
			break;
	}

	return { received: true, type: event.type };
};

const cancelRedirect = (paymentId: string, status: string) =>
	`${config.frontendUrl}/payment/cancel?paymentId=${paymentId}&status=${status}`;

const handleBkashCallback = async (query: Record<string, string | undefined>) => {
	const paymentID = query.paymentID;
	const status = query.status;

	if (!paymentID) {
		throw new AppError(httpStatus.BAD_REQUEST, "paymentID is missing");
	}
	if (!status) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment status is missing");
	}

	const payment = await prisma.payment.findFirst({
		where: {
			gatewayPaymentId: paymentID,
			gateway: PaymentGateway.BKASH,
		},
		include: { booking: { select: { status: true, deletedAt: true } } },
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "bKash payment record not found");
	}

	if (payment.status === PaymentStatus.PAID) {
		return {
			payment,
			redirectUrl: `${config.frontendUrl}/payment/success?paymentId=${payment.id}`,
		};
	}

	if (status === "failure" || status === "cancel") {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.PENDING },
			data: {
				status: status === "cancel" ? PaymentStatus.CANCELLED : PaymentStatus.FAILED,
			},
		});

		return { payment, redirectUrl: cancelRedirect(payment.id, status) };
	}

	if (status !== "success") {
		throw new AppError(httpStatus.BAD_REQUEST, `Unsupported bKash status: ${status}`);
	}

	// Never capture money for a superseded checkout or a booking that is no longer payable
	if (
		payment.status !== PaymentStatus.PENDING ||
		payment.booking.status !== BookingStatus.PENDING_PAYMENT ||
		payment.booking.deletedAt
	) {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.PENDING },
			data: { status: PaymentStatus.CANCELLED },
		});
		return { payment, redirectUrl: cancelRedirect(payment.id, "cancel") };
	}

	const idToken = await getBkashIdToken();
	const executeResponse = await fetch(`${config.bkash.baseUrl}/tokenized/checkout/execute`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: idToken,
			"X-App-Key": config.bkash.appKey,
		},
		body: JSON.stringify({ paymentID }),
	});

	const executeResult = (await executeResponse.json()) as {
		transactionStatus?: string;
		trxID?: string;
		amount?: string;
		statusMessage?: string;
	};

	if (executeResult.transactionStatus !== "Completed") {
		await prisma.payment.updateMany({
			where: { id: payment.id, status: PaymentStatus.PENDING },
			data: { status: PaymentStatus.FAILED },
		});
		return { payment, redirectUrl: cancelRedirect(payment.id, "failure") };
	}

	if (
		executeResult.amount &&
		Number(executeResult.amount) !== toBkashAmount(Number(payment.amount))
	) {
		throw new AppError(httpStatus.CONFLICT, "Paid amount does not match booking amount");
	}

	const { booking: _booking, ...paymentRow } = payment;
	const updated = await finalizePaidPayment(
		paymentRow,
		{ transactionId: executeResult.trxID ?? null },
		{ gateway: "BKASH", trxID: executeResult.trxID ?? null },
	);

	return {
		payment: updated,
		redirectUrl: `${config.frontendUrl}/payment/success?paymentId=${updated.id}`,
	};
};

const getMyPayments = async (user: AuthUser) => {
	return prisma.payment.findMany({
		where: { userId: user.id },
		select: paymentWithBookingSelect,
		orderBy: { createdAt: "desc" },
	});
};

const getPaymentById = async (paymentId: string, user: AuthUser) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		select: paymentWithBookingSelect,
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
	handleBkashCallback,
	getMyPayments,
	getPaymentById,
	supersedeOpenCheckouts,
};
