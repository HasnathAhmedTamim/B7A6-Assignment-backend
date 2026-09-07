import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

type RequestSource = "body" | "query" | "params";

const assignValidated = (req: Request, source: RequestSource, data: unknown) => {
	// Express 5: req.query / req.params are getter-only and cannot be assigned directly.
	if (source === "query" || source === "params") {
		Object.defineProperty(req, source, {
			value: data,
			writable: true,
			configurable: true,
			enumerable: true,
		});
		return;
	}

	req.body = data;
};

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

		assignValidated(req, source, parsed.data);
		next();
	};
};
