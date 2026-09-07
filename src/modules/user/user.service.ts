import httpStatus from "http-status";
import type { z } from "zod";
import { cloudinary } from "../../lib/cloudinary.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import type { updateMeSchema } from "./user.schema.js";

type UpdateMeInput = z.infer<typeof updateMeSchema>;

const userPublicSelect = {
	id: true,
	name: true,
	email: true,
	phone: true,
	role: true,
	status: true,
	authProvider: true,
	emailVerified: true,
	profileImage: true,
	imagePublicId: true,
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

const uploadProfileImage = async (userId: string, file?: Express.Multer.File) => {
	if (!file) {
		throw new AppError(httpStatus.BAD_REQUEST, "Profile image is required");
	}

	const existing = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: { id: true, imagePublicId: true },
	});

	if (!existing) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	const uploaded = await new Promise<{ secure_url: string; public_id: string }>(
		(resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(
				{
					folder: "housing/profile",
					resource_type: "image",
				},
				(error, result) => {
					if (error || !result) {
						reject(error ?? new Error("Cloudinary upload failed"));
						return;
					}
					resolve({
						secure_url: result.secure_url,
						public_id: result.public_id,
					});
				},
			);
			stream.end(file.buffer);
		},
	);

	if (existing.imagePublicId) {
		await cloudinary.uploader.destroy(existing.imagePublicId).catch(() => undefined);
	}

	const user = await prisma.user.update({
		where: { id: userId },
		data: {
			profileImage: uploaded.secure_url,
			imagePublicId: uploaded.public_id,
		},
		select: userPublicSelect,
	});

	await createAuditLog({
		userId,
		action: "PROFILE_IMAGE_UPDATED",
		entity: "User",
		entityId: userId,
	});

	return user;
};

export const UserService = {
	getMe,
	updateMe,
	uploadProfileImage,
};
