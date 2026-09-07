import type { Response } from "express";

interface SendResponseOptions<T> {
	res: Response;
	statusCode: number;
	message: string;
	data?: T;
	meta?: Record<string, unknown>;
}

export const sendResponse = <T>({
	res,
	statusCode,
	message,
	data = null as T,
	meta,
}: SendResponseOptions<T>) => {
	res.status(statusCode).json({
		success: true,
		message,
		...(meta ? { meta } : {}),
		data,
	});
};
