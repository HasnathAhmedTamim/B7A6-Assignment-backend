import { Role, UserStatus } from "@prisma/client";
import httpStatus from "http-status";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";

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

const getUsers = async () => {
	return prisma.user.findMany({
		where: { deletedAt: null },
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
			role: true,
			status: true,
			createdAt: true,
		},
		orderBy: { createdAt: "desc" },
	});
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
