import { z } from "zod";

export const createRentalRequestSchema = z.object({
	propertyId: z.string().uuid(),
	roomId: z.string().uuid(),
	message: z.string().trim().max(1000).optional(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional(),
});

export const rentalRequestIdSchema = z.object({
	id: z.string().uuid(),
});
