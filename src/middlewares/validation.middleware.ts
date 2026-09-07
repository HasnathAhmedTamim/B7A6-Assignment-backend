import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

type RequestSource = "body" | "query" | "params";

export const validateRequest = (schema: ZodType, source: RequestSource = "body") => {
	return (req: Request, _res: Response, next: NextFunction) => {
		const parsed = schema.safeParse(req[source]);

		if (!parsed.success) {
			return next(
				new AppError(
					httpStatus.BAD_REQUEST,
					"Validation failed",
					parsed.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				),
			);
		}

		req[source] = parsed.data;
		next();
	};
};
