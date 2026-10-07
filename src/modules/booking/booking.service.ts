import { BookingStatus, Role } from "@prisma/client";
import httpStatus from "http-status";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { PaymentService } from "../payment/payment.service.js";

export const bookingIdSchema = z.object({
	id: z.string().uuid(),
});

const bookingSelect = {
	id: true,
	tenantId: true,
	propertyId: true,
	roomId: true,
	rentalRequestId: true,
	startDate: true,
	endDate: true,
	rentAmount: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	tenant: {
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
		},
	},
	property: {
		select: {
			id: true,
			title: true,
			city: true,
			ownerId: true,
		},
	},
	room: {
		select: {
			id: true,
			name: true,
			monthlyRent: true,
		},
	},
	payments: {
		select: {
			id: true,
			status: true,
			amount: true,
			gateway: true,
			createdAt: true,
		},
	},
} as const;

const getMyBookings = async (user: AuthUser) => {
	const where =
		user.role === Role.TENANT
			? { tenantId: user.id, deletedAt: null }
			: user.role === Role.LANDLORD
				? { property: { ownerId: user.id }, deletedAt: null }
				: { deletedAt: null };

	return prisma.booking.findMany({
		where,
		select: bookingSelect,
		orderBy: { createdAt: "desc" },
	});
};

const getBookingById = async (bookingId: string, user: AuthUser) => {
	const booking = await prisma.booking.findFirst({
		where: { id: bookingId, deletedAt: null },
		select: bookingSelect,
	});

	if (!booking) {
		throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
	}

	const isOwner = booking.property.ownerId === user.id;
	const isTenant = booking.tenantId === user.id;

	if (user.role !== Role.ADMIN && !isOwner && !isTenant) {
		throw new AppError(httpStatus.FORBIDDEN, "You cannot access this booking");
	}

	return booking;
};

const CANCELLABLE_STATUSES: BookingStatus[] = [
	BookingStatus.PENDING_PAYMENT,
	BookingStatus.CONFIRMED,
];

const cancelBooking = async (bookingId: string, user: AuthUser) => {
	const booking = await prisma.booking.findFirst({
		where: { id: bookingId, deletedAt: null },
		include: { property: true },
	});

	if (!booking) {
		throw new AppError(httpStatus.NOT_FOUND, "Booking not found");
	}

	const isOwner = booking.property.ownerId === user.id;
	const isTenant = booking.tenantId === user.id;

	if (user.role !== Role.ADMIN && !isOwner && !isTenant) {
		throw new AppError(httpStatus.FORBIDDEN, "You cannot cancel this booking");
	}

	if (!CANCELLABLE_STATUSES.includes(booking.status)) {
		throw new AppError(httpStatus.CONFLICT, `Cannot cancel booking with status ${booking.status}`);
	}

	// Close open checkouts first so an old checkout tab cannot charge for a cancelled booking
	await PaymentService.supersedeOpenCheckouts(bookingId, false);

	const updated = await prisma.$transaction(async (tx) => {
		const cancelled = await tx.booking.updateMany({
			where: { id: bookingId, status: { in: CANCELLABLE_STATUSES } },
			data: { status: BookingStatus.CANCELLED },
		});

		if (cancelled.count !== 1) {
			throw new AppError(httpStatus.CONFLICT, "Booking can no longer be cancelled");
		}

		await tx.room.updateMany({
			where: { id: booking.roomId, deletedAt: null },
			data: { available: true },
		});

		return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: bookingSelect });
	});

	await createAuditLog({
		userId: user.id,
		action: "BOOKING_CANCELLED",
		entity: "Booking",
		entityId: bookingId,
	});

	return updated;
};

export const BookingService = {
	getMyBookings,
	getBookingById,
	cancelBooking,
};
