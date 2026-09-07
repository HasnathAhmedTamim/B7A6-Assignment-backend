import { z } from "zod";

export const updateMeSchema = z
	.object({
		name: z.string().trim().min(2).max(100).optional(),
		phone: z.string().trim().min(6).max(20).optional().nullable(),
		profileImage: z.string().url().optional().nullable(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});
