import { UserStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { prisma } from "../lib/prisma.js";
import type { AuthUser } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const extractToken = (req: Request) => {
	const authHeader = req.headers.authorization;
	const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
	return tokenFromHeader || req.cookies?.accessToken;
};

const resolveUser = async (token: string): Promise<AuthUser> => {
	let decoded: AuthUser;
	try {
		decoded = verifyAccessToken(token);
	} catch {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token");
	}

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

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
	};
};

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
	try {
		const token = extractToken(req);

		if (!token) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
		}

		req.user = await resolveUser(token);
		next();
	} catch (error) {
		if (error instanceof AppError) {
			return next(error);
		}
		return next(new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token"));
	}
};

/** Attaches `req.user` when a valid token is present; never rejects the request. */
export const optionalAuthenticate = async (req: Request, _res: Response, next: NextFunction) => {
	const token = extractToken(req);
	if (!token) {
		return next();
	}

	try {
		req.user = await resolveUser(token);
	} catch {
		req.user = undefined;
	}
	next();
};
