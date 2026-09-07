import { UserStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;
		const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
		const token = tokenFromHeader || req.cookies?.accessToken;

		if (!token) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
		}

		const decoded = verifyAccessToken(token);

		const user = await prisma.user.findFirst({
			where: {
				id: decoded.id,
				deletedAt: null,
			},
			select: {
				id: true,
				email: true,
				name: true,
				role: true,
				status: true,
			},
		});

		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
		}

		if (user.status === UserStatus.BLOCKED) {
			throw new AppError(httpStatus.FORBIDDEN, "Account is blocked");
		}

		req.user = {
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
		};

		next();
	} catch (error) {
		if (error instanceof AppError) {
			return next(error);
		}
		return next(new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token"));
	}
};
