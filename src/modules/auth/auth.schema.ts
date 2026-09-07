import { Role } from "@prisma/client";
import { z } from "zod";

export const registerSchema = z.object({
	name: z.string().trim().min(2).max(100),
	email: z.string().trim().email().toLowerCase(),
	password: z.string().min(8).max(128),
	phone: z.string().trim().min(6).max(20).optional(),
	role: z.enum([Role.LANDLORD, Role.TENANT]).default(Role.TENANT),
});

export const loginSchema = z.object({
	email: z.string().trim().email().toLowerCase(),
	password: z.string().min(1),
});

export const googleLoginSchema = z.object({
	idToken: z.string().min(10),
});

export const refreshTokenSchema = z.object({
	refreshToken: z.string().min(10).optional(),
});

export const forgotPasswordSchema = z.object({
	email: z.string().trim().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
	email: z.string().trim().email().toLowerCase(),
	otp: z.string().length(6),
	newPassword: z.string().min(8).max(128),
});
