import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../utils/AppError.js";

export const authorize =
	(...roles: Role[]) =>
	(req: Request, _res: Response, next: NextFunction) => {
		if (!req.user) {
			return next(new AppError(httpStatus.UNAUTHORIZED, "Authentication required"));
		}

		if (!roles.includes(req.user.role)) {
			return next(new AppError(httpStatus.FORBIDDEN, "You are not allowed to perform this action"));
		}

		next();
	};
