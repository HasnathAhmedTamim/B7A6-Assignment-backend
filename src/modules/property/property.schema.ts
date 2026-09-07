import { PropertyStatus, PropertyType } from "@prisma/client";
import { z } from "zod";

export const createPropertySchema = z.object({
	title: z.string().trim().min(3).max(200),
	description: z.string().trim().min(10).max(5000),
	address: z.string().trim().min(3).max(300),
	city: z.string().trim().min(2).max(100),
	location: z.string().trim().max(200).optional(),
	monthlyRent: z.coerce.number().positive(),
	propertyType: z.nativeEnum(PropertyType),
	bedrooms: z.coerce.number().int().min(0).max(50),
	bathrooms: z.coerce.number().int().min(0).max(50),
	status: z.nativeEnum(PropertyStatus).optional().default(PropertyStatus.DRAFT),
});

export const updatePropertySchema = createPropertySchema
	.partial()
	.refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const propertyIdParamsSchema = z.object({
	id: z.string().uuid(),
});

export const propertyQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
	search: z.string().trim().optional(),
	city: z.string().trim().optional(),
	location: z.string().trim().optional(),
	minRent: z.coerce.number().positive().optional(),
	maxRent: z.coerce.number().positive().optional(),
	propertyType: z.nativeEnum(PropertyType).optional(),
	bedrooms: z.coerce.number().int().min(0).optional(),
	bathrooms: z.coerce.number().int().min(0).optional(),
	available: z
		.enum(["true", "false"])
		.optional()
		.transform((v) => (v === undefined ? undefined : v === "true")),
	status: z.nativeEnum(PropertyStatus).optional(),
	sortBy: z.enum(["monthlyRent", "createdAt", "title", "city"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
