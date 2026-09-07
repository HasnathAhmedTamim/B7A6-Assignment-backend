import httpStatus from "http-status";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { updateMeSchema } from "./user.schema.js";

type UpdateMeInput = z.infer<typeof updateMeSchema>;

const userPublicSelect = {
	id: true,
	name: true,
	email: true,
	phone: true,
	role: true,
	status: true,
	profileImage: true,
	createdAt: true,
	updatedAt: true,
} as const;

const getMe = async (userId: string) => {
	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: userPublicSelect,
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return user;
};

const updateMe = async (userId: string, payload: UpdateMeInput) => {
	const user = await prisma.user.update({
		where: { id: userId },
		data: payload,
		select: userPublicSelect,
	});

	return user;
};

export const UserService = {
	getMe,
	updateMe,
};
