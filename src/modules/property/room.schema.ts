import { RoomType } from "@prisma/client";
import { z } from "zod";

// Zod 4 applies `.default()` values even inside `.partial()`, so the update schema
// must be built from fields that carry no defaults.
const roomFields = {
	name: z.string().trim().min(1).max(100),
	roomType: z.nativeEnum(RoomType),
	monthlyRent: z.coerce.number().positive(),
	capacity: z.coerce.number().int().min(1).max(20),
	available: z.boolean(),
};

export const createRoomSchema = z.object({
	...roomFields,
	roomType: roomFields.roomType.default(RoomType.SINGLE),
	capacity: roomFields.capacity.default(1),
	available: roomFields.available.optional().default(true),
});

export const updateRoomSchema = z
	.object(roomFields)
	.partial()
	.refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const propertyIdParamSchema = z.object({
	propertyId: z.string().uuid(),
});

export const roomIdParamSchema = z.object({
	id: z.string().uuid(),
});
