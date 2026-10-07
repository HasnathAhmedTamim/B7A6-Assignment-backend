import { type Prisma, Role, UserStatus } from "@prisma/client";
import httpStatus from "http-status";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { isProtectedDemoAccount } from "../../utils/demo.js";

export const adminUserIdSchema = z.object({
	id: z.string().uuid(),
});

export const updateUserStatusSchema = z.object({
	status: z.nativeEnum(UserStatus),
});

export const updateUserRoleSchema = z.object({
	role: z.nativeEnum(Role),
});

export const auditLogQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Pagination is opt-in: without `limit` the full list is returned, as before.
export const adminUserQuerySchema = z.object({
	search: z.string().trim().min(1).max(100).optional(),
	role: z.nativeEnum(Role).optional(),
	status: z.nativeEnum(UserStatus).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

const getUsers = async ({ search, role, status, page, limit }: AdminUserQuery) => {
	const where: Prisma.UserWhereInput = {
		deletedAt: null,
		...(role ? { role } : {}),
		...(status ? { status } : {}),
		...(search
			? {
					OR: [
						{ name: { contains: search, mode: "insensitive" } },
						{ email: { contains: search, mode: "insensitive" } },
						{ phone: { contains: search } },
					],
				}
			: {}),
	};

	const [total, data] = await prisma.$transaction([
		prisma.user.count({ where }),
		prisma.user.findMany({
			where,
			select: {
				id: true,
				name: true,
				email: true,
				phone: true,
				role: true,
				status: true,
				authProvider: true,
				profileImage: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
			...(limit ? { skip: (page - 1) * limit, take: limit } : {}),
		}),
	]);

	const pageSize = limit ?? Math.max(total, 1);
	return {
		meta: {
			page: limit ? page : 1,
			limit: pageSize,
			total,
			totalPages: Math.max(Math.ceil(total / pageSize), 1),
		},
		data,
	};
};

const updateUserStatus = async (admin: AuthUser, userId: string, status: UserStatus) => {
	if (admin.id === userId) {
		throw new AppError(httpStatus.BAD_REQUEST, "You cannot change your own status");
	}

	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (isProtectedDemoAccount(user.email)) {
		throw new AppError(httpStatus.FORBIDDEN, "Demo accounts cannot be blocked or activated");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { status },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			status: true,
		},
	});

	await createAuditLog({
		userId: admin.id,
		action: "ADMIN_USER_STATUS_UPDATED",
		entity: "User",
		entityId: userId,
		metadata: { status },
	});

	return updated;
};

const updateUserRole = async (admin: AuthUser, userId: string, role: Role) => {
	if (admin.id === userId) {
		throw new AppError(httpStatus.BAD_REQUEST, "You cannot change your own role");
	}

	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (isProtectedDemoAccount(user.email)) {
		throw new AppError(httpStatus.FORBIDDEN, "Demo account roles cannot be changed");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { role },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			status: true,
		},
	});

	await createAuditLog({
		userId: admin.id,
		action: "ADMIN_USER_ROLE_UPDATED",
		entity: "User",
		entityId: userId,
		metadata: { role },
	});

	return updated;
};

const getDashboardStats = async () => {
	const [
		totalUsers,
		totalLandlords,
		totalTenants,
		totalProperties,
		totalRooms,
		availableRooms,
		pendingRequests,
		confirmedBookings,
		paidPayments,
	] = await Promise.all([
		prisma.user.count({ where: { deletedAt: null } }),
		prisma.user.count({ where: { deletedAt: null, role: Role.LANDLORD } }),
		prisma.user.count({ where: { deletedAt: null, role: Role.TENANT } }),
		prisma.property.count({ where: { deletedAt: null } }),
		prisma.room.count({ where: { deletedAt: null } }),
		prisma.room.count({ where: { deletedAt: null, available: true } }),
		prisma.rentalRequest.count({ where: { status: "PENDING" } }),
		prisma.booking.count({ where: { deletedAt: null, status: "CONFIRMED" } }),
		prisma.payment.count({ where: { status: "PAID" } }),
	]);

	return {
		totalUsers,
		totalLandlords,
		totalTenants,
		totalProperties,
		totalRooms,
		availableRooms,
		pendingRequests,
		confirmedBookings,
		paidPayments,
	};
};

const getAuditLogs = async (page: number, limit: number) => {
	const where = {};
	const [total, data] = await prisma.$transaction([
		prisma.auditLog.count({ where }),
		prisma.auditLog.findMany({
			where,
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * limit,
			take: limit,
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

export const AdminService = {
	getUsers,
	updateUserStatus,
	updateUserRole,
	getDashboardStats,
	getAuditLogs,
};
