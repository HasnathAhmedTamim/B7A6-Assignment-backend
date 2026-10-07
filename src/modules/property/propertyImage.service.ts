import httpStatus from "http-status";
import { destroyImage, type UploadedImage, uploadImage } from "../../lib/cloudinary.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/auth.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { PropertyService, propertyImagesSelect } from "./property.service.js";

export const MAX_PROPERTY_IMAGES = 8;

const listImages = (propertyId: string) =>
	prisma.propertyImage.findMany({ where: { propertyId }, ...propertyImagesSelect });

const tooManyImages = (existing: number) =>
	new AppError(
		httpStatus.BAD_REQUEST,
		`A property can have at most ${MAX_PROPERTY_IMAGES} photos (it has ${existing})`,
	);

const addImages = async (propertyId: string, user: AuthUser, files: Express.Multer.File[] = []) => {
	if (files.length === 0) {
		throw new AppError(httpStatus.BAD_REQUEST, "Select at least one image");
	}

	await PropertyService.assertPropertyOwner(propertyId, user);

	const existing = await prisma.propertyImage.count({ where: { propertyId } });
	if (existing + files.length > MAX_PROPERTY_IMAGES) {
		throw tooManyImages(existing);
	}

	const results = await Promise.allSettled(
		files.map((file) =>
			uploadImage(file.buffer, {
				folder: "housing/properties",
				transformation: [{ width: 1600, height: 1600, crop: "limit", quality: "auto" }],
			}),
		),
	);
	const uploaded = results
		.filter((r): r is PromiseFulfilledResult<UploadedImage> => r.status === "fulfilled")
		.map((r) => r.value);

	if (uploaded.length !== files.length) {
		await Promise.all(uploaded.map((image) => destroyImage(image.publicId)));
		throw new AppError(httpStatus.BAD_GATEWAY, "Image upload failed. Please try again");
	}

	try {
		await prisma.$transaction(async (tx) => {
			// Lock the property row so concurrent uploads can't exceed the limit
			await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
			const count = await tx.propertyImage.count({ where: { propertyId } });
			if (count + uploaded.length > MAX_PROPERTY_IMAGES) {
				throw tooManyImages(count);
			}
			const last = await tx.propertyImage.aggregate({
				where: { propertyId },
				_max: { position: true },
			});
			const start = (last._max.position ?? -1) + 1;
			await tx.propertyImage.createMany({
				data: uploaded.map((image, i) => ({
					propertyId,
					url: image.url,
					publicId: image.publicId,
					position: start + i,
				})),
			});
		});
	} catch (error) {
		await Promise.all(uploaded.map((image) => destroyImage(image.publicId)));
		throw error;
	}

	await createAuditLog({
		userId: user.id,
		action: "PROPERTY_IMAGES_ADDED",
		entity: "Property",
		entityId: propertyId,
		metadata: { count: uploaded.length },
	});

	return listImages(propertyId);
};

const deleteImage = async (propertyId: string, imageId: string, user: AuthUser) => {
	await PropertyService.assertPropertyOwner(propertyId, user);

	const image = await prisma.propertyImage.findFirst({
		where: { id: imageId, propertyId },
		select: { id: true, publicId: true },
	});

	if (!image) {
		throw new AppError(httpStatus.NOT_FOUND, "Image not found");
	}

	await prisma.propertyImage.delete({ where: { id: image.id } });
	await destroyImage(image.publicId);

	await createAuditLog({
		userId: user.id,
		action: "PROPERTY_IMAGE_DELETED",
		entity: "Property",
		entityId: propertyId,
		metadata: { imageId },
	});

	return listImages(propertyId);
};

export const PropertyImageService = {
	addImages,
	deleteImage,
};
