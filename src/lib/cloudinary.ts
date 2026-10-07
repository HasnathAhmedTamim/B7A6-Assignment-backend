import { type UploadApiOptions, v2 as cloudinary } from "cloudinary";
import config from "../config/index.js";

cloudinary.config({
	cloud_name: config.cloudinary.cloudName,
	api_key: config.cloudinary.apiKey,
	api_secret: config.cloudinary.apiSecret,
});

export type UploadedImage = { url: string; publicId: string };

export const uploadImage = (buffer: Buffer, options: UploadApiOptions) =>
	new Promise<UploadedImage>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{ resource_type: "image", ...options },
			(error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload failed"));
					return;
				}
				resolve({ url: result.secure_url, publicId: result.public_id });
			},
		);
		stream.end(buffer);
	});

export const destroyImage = (publicId: string) =>
	cloudinary.uploader.destroy(publicId).catch(() => undefined);

export { cloudinary };
