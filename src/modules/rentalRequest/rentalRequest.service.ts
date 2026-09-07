import { BookingStatus, RentalRequestStatus, Role } from "@prisma/client";
import httpStatus from "http-status";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import type { createRentalRequestSchema } from "./rentalRequest.schema.js";

type CreateRentalRequestInput = z.infer<typeof createRentalRequestSchema>;

const requestSelect = {
	id: true,
	tenantId: true,
	propertyId: true,
	roomId: true,
	message: true,
	startDate: true,
	endDate: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	property: {
		select: {
			id: true,
			title: true,
			city: true,
			ownerId: true,
			monthlyRent: true,
		},
	},
	room: {
		select: {
			id: true,
			name: true,
			monthlyRent: true,
			available: true,
		},
	},
	tenant: {
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
		},
	},
	booking: {
		select: {
			id: true,
			status: true,
			rentAmount: true,
			startDate: true,
			endDate: true,
		},
	},
} as const;

const createRequest = async (user: AuthUser, payload: CreateRentalRequestInput) => {
	if (user.role !== Role.TENANT) {
		throw new AppError(httpStatus.FORBIDDEN, "Only tenants can create rental requests");
	}

	if (payload.endDate && payload.endDate <= payload.startDate) {
		throw new AppError(httpStatus.BAD_REQUEST, "endDate must be after startDate");
	}

	const room = await prisma.room.findFirst({
		where: {
			id: payload.roomId,
			propertyId: payload.propertyId,
			deletedAt: null,
			property: { deletedAt: null },
		},
		include: { property: true },
	});

	if (!room) {
		throw new AppError(httpStatus.NOT_FOUND, "Room not found for this property");
	}

	if (!room.available) {
		throw new AppError(httpStatus.CONFLICT, "Room is not available");
	}

	const existingPending = await prisma.rentalRequest.findFirst({
		where: {
			tenantId: user.id,
			roomId: payload.roomId,
			status: RentalRequestStatus.PENDING,
		},
	});

	if (existingPending) {
		throw new AppError(httpStatus.CONFLICT, "You already have a pending request for this room");
	}

	const request = await prisma.rentalRequest.create({
		data: {
			tenantId: user.id,
			propertyId: payload.propertyId,
			roomId: payload.roomId,
			message: payload.message,
			startDate: payload.startDate,
			endDate: payload.endDate,
		},
		select: requestSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "RENTAL_REQUEST_CREATED",
		entity: "RentalRequest",
		entityId: request.id,
	});

	return request;
};

const getMyRequests = async (user: AuthUser) => {
	return prisma.rentalRequest.findMany({
		where: { tenantId: user.id },
		select: requestSelect,
		orderBy: { createdAt: "desc" },
	});
};

const getReceivedRequests = async (user: AuthUser) => {
	return prisma.rentalRequest.findMany({
		where: {
			property: {
				ownerId: user.id,
				deletedAt: null,
			},
		},
		select: requestSelect,
		orderBy: { createdAt: "desc" },
	});
};

const approveRequest = async (requestId: string, user: AuthUser) => {
	const request = await prisma.rentalRequest.findUnique({
		where: { id: requestId },
		include: {
			property: true,
			room: true,
			booking: true,
		},
	});

	if (!request) {
		throw new AppError(httpStatus.NOT_FOUND, "Rental request not found");
	}

	if (user.role !== Role.ADMIN && request.property.ownerId !== user.id) {
		throw new AppError(httpStatus.FORBIDDEN, "You can only approve requests for your properties");
	}

	if (request.status !== RentalRequestStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot approve a request with status ${request.status}`,
		);
	}

	if (!request.room.available || request.room.deletedAt) {
		throw new AppError(httpStatus.CONFLICT, "Room is no longer available");
	}

	const conflictingBooking = await prisma.booking.findFirst({
		where: {
			roomId: request.roomId,
			deletedAt: null,
			status: {
				in: [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED],
			},
		},
	});

	if (conflictingBooking) {
		throw new AppError(httpStatus.CONFLICT, "Room already has an active booking");
	}

	return prisma.$transaction(
		async (tx) => {
			const locked = await tx.rentalRequest.findUnique({
				where: { id: requestId },
				include: { room: true },
			});

			if (!locked || locked.status !== RentalRequestStatus.PENDING) {
				throw new AppError(httpStatus.CONFLICT, "Rental request is no longer pending");
			}

			if (!locked.room.available) {
				throw new AppError(httpStatus.CONFLICT, "Room is no longer available");
			}

			const updatedRequest = await tx.rentalRequest.update({
				where: { id: requestId },
				data: { status: RentalRequestStatus.APPROVED },
			});

			await tx.room.update({
				where: { id: request.roomId },
				data: { available: false },
			});

			const booking = await tx.booking.create({
				data: {
					tenantId: request.tenantId,
					propertyId: request.propertyId,
					roomId: request.roomId,
					rentalRequestId: request.id,
					startDate: request.startDate,
					endDate: request.endDate,
					rentAmount: request.room.monthlyRent,
					status: BookingStatus.PENDING_PAYMENT,
				},
			});

			await tx.auditLog.create({
				data: {
					userId: user.id,
					action: "RENTAL_REQUEST_APPROVED",
					entity: "RentalRequest",
					entityId: requestId,
					metadata: { bookingId: booking.id },
				},
			});

			await tx.auditLog.create({
				data: {
					userId: user.id,
					action: "BOOKING_CREATED",
					entity: "Booking",
					entityId: booking.id,
				},
			});

			return { request: updatedRequest, booking };
		},
		{
			maxWait: 10000,
			timeout: 20000,
		},
	);
};

const rejectRequest = async (requestId: string, user: AuthUser) => {
	const request = await prisma.rentalRequest.findUnique({
		where: { id: requestId },
		include: { property: true },
	});

	if (!request) {
		throw new AppError(httpStatus.NOT_FOUND, "Rental request not found");
	}

	if (user.role !== Role.ADMIN && request.property.ownerId !== user.id) {
		throw new AppError(httpStatus.FORBIDDEN, "You can only reject requests for your properties");
	}

	if (request.status !== RentalRequestStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot reject a request with status ${request.status}`,
		);
	}

	const updated = await prisma.rentalRequest.update({
		where: { id: requestId },
		data: { status: RentalRequestStatus.REJECTED },
		select: requestSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "RENTAL_REQUEST_REJECTED",
		entity: "RentalRequest",
		entityId: requestId,
	});

	return updated;
};

const cancelRequest = async (requestId: string, user: AuthUser) => {
	const request = await prisma.rentalRequest.findUnique({
		where: { id: requestId },
	});

	if (!request) {
		throw new AppError(httpStatus.NOT_FOUND, "Rental request not found");
	}

	if (user.role !== Role.ADMIN && request.tenantId !== user.id) {
		throw new AppError(httpStatus.FORBIDDEN, "You can only cancel your own requests");
	}

	if (request.status !== RentalRequestStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot cancel a request with status ${request.status}`,
		);
	}

	const updated = await prisma.rentalRequest.update({
		where: { id: requestId },
		data: { status: RentalRequestStatus.CANCELLED },
		select: requestSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "RENTAL_REQUEST_CANCELLED",
		entity: "RentalRequest",
		entityId: requestId,
	});

	return updated;
};

export const RentalRequestService = {
	createRequest,
	getMyRequests,
	getReceivedRequests,
	approveRequest,
	rejectRequest,
	cancelRequest,
};
