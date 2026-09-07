import { RoomType } from "@prisma/client";
import { z } from "zod";

export const createRoomSchema = z.object({
	name: z.string().trim().min(1).max(100),
	roomType: z.nativeEnum(RoomType).default(RoomType.SINGLE),
	monthlyRent: z.coerce.number().positive(),
	capacity: z.coerce.number().int().min(1).max(20).default(1),
	available: z.boolean().optional().default(true),
});

export const updateRoomSchema = createRoomSchema
	.partial()
	.refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const propertyIdParamSchema = z.object({
	propertyId: z.string().uuid(),
});

export const roomIdParamSchema = z.object({
	id: z.string().uuid(),
});
