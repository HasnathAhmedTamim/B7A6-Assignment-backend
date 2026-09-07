import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import config from "../config/index.js";
import type { AuthUser } from "../types/auth.js";

export const signAccessToken = (payload: AuthUser) => {
	return jwt.sign(payload, config.jwt.accessSecret, {
		expiresIn: config.jwt.accessExpiresIn,
	} as SignOptions);
};

export const signRefreshToken = (payload: { id: string }) => {
	return jwt.sign(payload, config.jwt.refreshSecret, {
		expiresIn: config.jwt.refreshExpiresIn,
	} as SignOptions);
};

export const verifyAccessToken = (token: string) => {
	return jwt.verify(token, config.jwt.accessSecret) as AuthUser;
};

export const verifyRefreshToken = (token: string) => {
	return jwt.verify(token, config.jwt.refreshSecret) as { id: string };
};

export const hashToken = (token: string) => {
	return crypto.createHash("sha256").update(token).digest("hex");
};
