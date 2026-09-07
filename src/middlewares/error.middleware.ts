import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

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
