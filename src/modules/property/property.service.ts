import type { Prisma } from "@prisma/client";
import { PropertyStatus, Role } from "@prisma/client";
import httpStatus from "http-status";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import type {
	createPropertySchema,
	propertyQuerySchema,
	updatePropertySchema,
} from "./property.schema.js";

type CreatePropertyInput = z.infer<typeof createPropertySchema>;
type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
type PropertyQuery = z.infer<typeof propertyQuerySchema>;

const propertySelect = {
	id: true,
	ownerId: true,
	title: true,
	description: true,
	address: true,
	city: true,
	location: true,
	monthlyRent: true,
	propertyType: true,
	bedrooms: true,
	bathrooms: true,
	status: true,
	createdAt: true,
	updatedAt: true,
	owner: {
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
		},
	},
	_count: {
		select: {
			rooms: {
				where: { deletedAt: null, available: true },
			},
		},
	},
} as const;

const createProperty = async (user: AuthUser, payload: CreatePropertyInput) => {
	if (user.role !== Role.LANDLORD && user.role !== Role.ADMIN) {
		throw new AppError(httpStatus.FORBIDDEN, "Only landlords can create properties");
	}

	const property = await prisma.property.create({
		data: {
			...payload,
			ownerId: user.id,
		},
		select: propertySelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "PROPERTY_CREATED",
		entity: "Property",
		entityId: property.id,
	});

	return property;
};

const getProperties = async (query: PropertyQuery) => {
	const {
		page,
		limit,
		search,
		city,
		location,
		minRent,
		maxRent,
		propertyType,
		bedrooms,
		bathrooms,
		available,
		status,
		sortBy,
		sortOrder,
	} = query;

	const where: Prisma.PropertyWhereInput = {
		deletedAt: null,
		status: status ?? PropertyStatus.PUBLISHED,
		...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
		...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
		...(propertyType ? { propertyType } : {}),
		...(bedrooms !== undefined ? { bedrooms } : {}),
		...(bathrooms !== undefined ? { bathrooms } : {}),
		...(minRent !== undefined || maxRent !== undefined
			? {
					monthlyRent: {
						...(minRent !== undefined ? { gte: minRent } : {}),
						...(maxRent !== undefined ? { lte: maxRent } : {}),
					},
				}
			: {}),
		...(search
			? {
					OR: [
						{ title: { contains: search, mode: "insensitive" } },
						{ description: { contains: search, mode: "insensitive" } },
						{ city: { contains: search, mode: "insensitive" } },
						{ address: { contains: search, mode: "insensitive" } },
					],
				}
			: {}),
		...(available === true
			? {
					rooms: {
						some: {
							available: true,
							deletedAt: null,
						},
					},
				}
			: {}),
	};

	const [total, data] = await prisma.$transaction([
		prisma.property.count({ where }),
		prisma.property.findMany({
			where,
			select: propertySelect,
			skip: (page - 1) * limit,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
		}),
	]);

	return {
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data,
	};
};

const getPropertyById = async (id: string) => {
	const property = await prisma.property.findFirst({
		where: { id, deletedAt: null },
		select: {
			...propertySelect,
			rooms: {
				where: { deletedAt: null },
				select: {
					id: true,
					name: true,
					roomType: true,
					monthlyRent: true,
					capacity: true,
					available: true,
				},
			},
		},
	});

	if (!property) {
		throw new AppError(httpStatus.NOT_FOUND, "Property not found");
	}

	return property;
};

const assertPropertyOwner = async (propertyId: string, user: AuthUser) => {
	const property = await prisma.property.findFirst({
		where: { id: propertyId, deletedAt: null },
	});

	if (!property) {
		throw new AppError(httpStatus.NOT_FOUND, "Property not found");
	}

	if (user.role !== Role.ADMIN && property.ownerId !== user.id) {
		throw new AppError(httpStatus.FORBIDDEN, "You can only manage your own properties");
	}

	return property;
};

const updateProperty = async (id: string, user: AuthUser, payload: UpdatePropertyInput) => {
	await assertPropertyOwner(id, user);

	const property = await prisma.property.update({
		where: { id },
		data: payload,
		select: propertySelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "PROPERTY_UPDATED",
		entity: "Property",
		entityId: id,
	});

	return property;
};

const deleteProperty = async (id: string, user: AuthUser) => {
	await assertPropertyOwner(id, user);

	const property = await prisma.property.update({
		where: { id },
		data: { deletedAt: new Date(), status: PropertyStatus.ARCHIVED },
		select: propertySelect,
	});

	await createAuditLog({
		userId: user.id,
		action: "PROPERTY_DELETED",
		entity: "Property",
		entityId: id,
	});

	return property;
};

export const PropertyService = {
	createProperty,
	getProperties,
	getPropertyById,
	updateProperty,
	deleteProperty,
	assertPropertyOwner,
};
