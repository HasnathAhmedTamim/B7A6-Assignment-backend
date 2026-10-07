import { RentalRequestStatus } from "@prisma/client";
import httpStatus from "http-status";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { ACTIVE_BOOKING_STATUSES, PropertyService } from "./property.service.js";
import type { createRoomSchema, updateRoomSchema } from "./room.schema.js";

type CreateRoomInput = z.infer<typeof createRoomSchema>;
type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

const roomSelect = {
	id: true,
	propertyId: true,
	name: true,
	roomType: true,
	monthlyRent: true,
	capacity: true,
	available: true,
	createdAt: true,
	updatedAt: true,
} as const;

const findActiveBooking = (roomId: string) =>
	prisma.booking.findFirst({
		where: { roomId, deletedAt: null, status: { in: ACTIVE_BOOKING_STATUSES } },
		select: { id: true },
	});

const createRoom = async (propertyId: string, user: AuthUser, payload: CreateRoomInput) => {
	await PropertyService.assertPropertyOwner(propertyId, user);

	const room = await prisma.room.create({
		data: {
			...payload,
			propertyId,
		},
		select: roomSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "ROOM_CREATED",
		entity: "Room",
		entityId: room.id,
		metadata: { propertyId },
	});

	return room;
};

const getRoomsByProperty = async (propertyId: string, user?: AuthUser) => {
	await PropertyService.assertPropertyVisible(propertyId, user);

	return prisma.room.findMany({
		where: { propertyId, deletedAt: null },
		select: roomSelect,
		orderBy: { createdAt: "asc" },
	});
};

const updateRoom = async (roomId: string, user: AuthUser, payload: UpdateRoomInput) => {
	const room = await prisma.room.findFirst({
		where: { id: roomId, deletedAt: null },
		include: { property: true },
	});

	if (!room || room.property.deletedAt) {
		throw new AppError(httpStatus.NOT_FOUND, "Room not found");
	}

	await PropertyService.assertPropertyOwner(room.propertyId, user);

	if (payload.available === true && !room.available && (await findActiveBooking(roomId))) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Room has an active booking and cannot be marked available",
		);
	}

	const updated = await prisma.room.update({
		where: { id: roomId },
		data: payload,
		select: roomSelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "ROOM_UPDATED",
		entity: "Room",
		entityId: roomId,
	});

	return updated;
};

const deleteRoom = async (roomId: string, user: AuthUser) => {
	const room = await prisma.room.findFirst({
		where: { id: roomId, deletedAt: null },
	});

	if (!room) {
		throw new AppError(httpStatus.NOT_FOUND, "Room not found");
	}

	await PropertyService.assertPropertyOwner(room.propertyId, user);

	if (await findActiveBooking(roomId)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Room has an active booking. Cancel it before deleting the room",
		);
	}

	const { deleted, rejectedRequests } = await prisma.$transaction(async (tx) => {
		const rejected = await tx.rentalRequest.updateMany({
			where: { roomId, status: RentalRequestStatus.PENDING },
			data: { status: RentalRequestStatus.REJECTED },
		});

		const softDeleted = await tx.room.update({
			where: { id: roomId },
			data: {
				deletedAt: new Date(),
				available: false,
			},
			select: roomSelect,
		});

		return { deleted: softDeleted, rejectedRequests: rejected.count };
	});

	await createAuditLog({
		userId: user.id,
		action: "ROOM_DELETED",
		entity: "Room",
		entityId: roomId,
		metadata: { rejectedRequests },
	});

	return deleted;
};

export const RoomService = {
	createRoom,
	getRoomsByProperty,
	updateRoom,
	deleteRoom,
};
