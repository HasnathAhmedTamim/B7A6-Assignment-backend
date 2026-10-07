import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import multer from "multer";
import { ZodError } from "zod";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

const multerMessages: Partial<Record<multer.ErrorCode, string>> = {
	LIMIT_FILE_SIZE: "File is too large. Maximum size is 5 MB",
	LIMIT_UNEXPECTED_FILE: "Unexpected file field",
	LIMIT_FILE_COUNT: "Too many files",
};

/** body-parser errors carry `type` and `status` (e.g. malformed JSON, payload too large). */
const isBodyParserError = (err: unknown): err is Error & { type: string; status: number } =>
	err instanceof Error &&
	typeof (err as { type?: unknown }).type === "string" &&
	typeof (err as { status?: unknown }).status === "number";

export const globalErrorHandler = (
	err: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let message = "Something went wrong";
	let errors: unknown[] = [];

	if (err instanceof AppError) {
		statusCode = err.statusCode;
		message = err.message;
		errors = err.errors;
	} else if (err instanceof ZodError) {
		statusCode = httpStatus.BAD_REQUEST;
		message = "Validation failed";
		errors = err.issues.map((issue) => ({
			path: issue.path.join("."),
			message: issue.message,
		}));
	} else if (err instanceof multer.MulterError) {
		statusCode =
			err.code === "LIMIT_FILE_SIZE" ? httpStatus.REQUEST_ENTITY_TOO_LARGE : httpStatus.BAD_REQUEST;
		message = multerMessages[err.code] ?? err.message;
		errors = err.field ? [{ path: err.field, message }] : [];
	} else if (isBodyParserError(err)) {
		statusCode = err.status;
		message = err.type === "entity.parse.failed" ? "Malformed JSON request body" : err.message;
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.CONFLICT;
			message = "A record with the same unique value already exists";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.NOT_FOUND;
			message = "Resource not found";
		} else {
			message = config.isProduction ? "Something went wrong" : err.message;
		}
	} else if (err instanceof Error) {
		message = config.isProduction ? "Something went wrong" : err.message;
	}

	res.status(statusCode).json({
		success: false,
		message,
		errors,
		...(config.isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
	});
};
