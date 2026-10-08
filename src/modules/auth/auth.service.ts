import { AuthProvider, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import ejs from "ejs";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import httpStatus from "http-status";
import path from "node:path";
import type { z } from "zod";
import config from "../../config/index.js";
import { sendMailWithTimeout } from "../../lib/nodemailer.js";
import { prisma } from "../../lib/prisma.js";
import { redisClient } from "../../lib/redis.js";
import { AppError } from "../../utils/AppError.js";
import { createAuditLog } from "../../utils/audit.js";
import { isProtectedDemoAccount } from "../../utils/demo.js";
import {
	hashToken,
	signAccessToken,
	signRefreshToken,
	verifyRefreshToken,
} from "../../utils/jwt.js";
import type {
	forgotPasswordSchema,
	googleLoginSchema,
	loginSchema,
	registerSchema,
	resetPasswordSchema,
} from "./auth.schema.js";

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const googleClient = new OAuth2Client(config.google.clientId);

const userPublicSelect = {
	id: true,
	name: true,
	email: true,
	phone: true,
	role: true,
	status: true,
	authProvider: true,
	emailVerified: true,
	profileImage: true,
	createdAt: true,
	updatedAt: true,
} as const;

const FORGOT_PASSWORD_OTP_TTL = 5 * 60;
const MAX_OTP_ATTEMPTS = 5;
const otpKeyFor = (email: string) => `forgot-password-otp:${email}`;
const otpAttemptsKeyFor = (email: string) => `forgot-password-otp-attempts:${email}`;

const parseDurationToMs = (value: string) => {
	const match = /^(\d+)([smhd])$/.exec(value);
	if (!match?.[1] || !match[2]) {
		return 7 * 24 * 60 * 60 * 1000;
	}
	const amount = Number(match[1]);
	const unit = match[2];
	const multipliers: Record<string, number> = {
		s: 1000,
		m: 60 * 1000,
		h: 60 * 60 * 1000,
		d: 24 * 60 * 60 * 1000,
	};
	return amount * (multipliers[unit] ?? 24 * 60 * 60 * 1000);
};

const issueTokens = async (user: { id: string; email: string; name: string; role: Role }) => {
	const accessToken = signAccessToken({
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
	});
	const refreshToken = signRefreshToken({ id: user.id });
	const tokenHash = hashToken(refreshToken);
	const expiresAt = new Date(Date.now() + parseDurationToMs(config.jwt.refreshExpiresIn));

	await prisma.refreshToken.create({
		data: {
			userId: user.id,
			tokenHash,
			expiresAt,
		},
	});

	return { accessToken, refreshToken };
};

const register = async (payload: RegisterInput) => {
	const existing = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (existing && !existing.deletedAt) {
		throw new AppError(httpStatus.CONFLICT, "Email already registered");
	}

	const hashedPassword = await bcrypt.hash(payload.password, config.bcryptSaltRounds);

	const user = await prisma.user.create({
		data: {
			name: payload.name,
			email: payload.email,
			password: hashedPassword,
			phone: payload.phone,
			role: payload.role,
			authProvider: AuthProvider.CREDENTIAL,
			emailVerified: true,
		},
		select: userPublicSelect,
	});

	const tokens = await issueTokens(user);

	await createAuditLog({
		userId: user.id,
		action: "USER_REGISTERED",
		entity: "User",
		entityId: user.id,
		metadata: { role: user.role },
	});

	return { user, ...tokens };
};

const login = async (payload: LoginInput) => {
	const user = await prisma.user.findFirst({
		where: {
			email: payload.email,
			deletedAt: null,
		},
	});

	if (!user || !user.password) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "Account is blocked");
	}

	const isMatch = await bcrypt.compare(payload.password, user.password);
	if (!isMatch) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	const tokens = await issueTokens(user);

	await createAuditLog({
		userId: user.id,
		action: "USER_LOGIN",
		entity: "User",
		entityId: user.id,
	});

	const { password: _password, ...safeUser } = user;
	return { user: safeUser, ...tokens };
};

const googleLogin = async (payload: GoogleLoginInput) => {
	if (!config.google.clientId) {
		throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "Google login is not configured");
	}

	let googlePayload: TokenPayload | undefined;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google.clientId,
		});
		googlePayload = ticket.getPayload();
	} catch {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Google token");
	}

	if (!googlePayload?.email || !googlePayload.sub) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Google token");
	}

	const email = googlePayload.email.toLowerCase();

	let user = await prisma.user.findFirst({
		where: {
			OR: [{ googleId: googlePayload.sub }, { email }],
			deletedAt: null,
		},
	});

	if (user?.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "Account is blocked");
	}

	if (!user) {
		user = await prisma.user.create({
			data: {
				name: googlePayload.name ?? email.split("@")[0] ?? "Google User",
				email,
				googleId: googlePayload.sub,
				profileImage: googlePayload.picture,
				role: payload.role ?? Role.TENANT,
				authProvider: AuthProvider.GOOGLE,
				emailVerified: true,
			},
		});

		await createAuditLog({
			userId: user.id,
			action: "USER_REGISTERED_GOOGLE",
			entity: "User",
			entityId: user.id,
		});
	} else if (!user.googleId) {
		user = await prisma.user.update({
			where: { id: user.id },
			data: {
				googleId: googlePayload.sub,
				profileImage: user.profileImage ?? googlePayload.picture,
				emailVerified: true,
				// Keep CREDENTIAL if they already have a password; otherwise mark GOOGLE
				authProvider: user.password ? user.authProvider : AuthProvider.GOOGLE,
			},
		});
	}

	const tokens = await issueTokens(user);
	const { password: _password, ...safeUser } = user;

	await createAuditLog({
		userId: user.id,
		action: "USER_LOGIN_GOOGLE",
		entity: "User",
		entityId: user.id,
	});

	return { user: safeUser, ...tokens };
};

const refresh = async (refreshToken?: string) => {
	if (!refreshToken) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token required");
	}

	let decoded: { id: string };
	try {
		decoded = verifyRefreshToken(refreshToken);
	} catch {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}

	const tokenHash = hashToken(refreshToken);
	const stored = await prisma.refreshToken.findFirst({
		where: {
			tokenHash,
			userId: decoded.id,
			revokedAt: null,
			expiresAt: { gt: new Date() },
		},
	});

	if (!stored) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is invalid or revoked");
	}

	const user = await prisma.user.findFirst({
		where: { id: decoded.id, deletedAt: null },
	});

	if (!user || user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User not allowed");
	}

	await prisma.refreshToken.update({
		where: { id: stored.id },
		data: { revokedAt: new Date() },
	});

	const tokens = await issueTokens(user);
	const { password: _password, ...safeUser } = user;
	return { user: safeUser, ...tokens };
};

/**
 * Works with a valid access token, a refresh token, or both, so a client whose access token
 * already expired can still revoke its refresh token.
 */
const logout = async (userId: string | undefined, refreshToken?: string) => {
	if (!userId && !refreshToken) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");
	}

	let actorId = userId;

	if (refreshToken) {
		const stored = await prisma.refreshToken.findUnique({
			where: { tokenHash: hashToken(refreshToken) },
		});

		if (stored && (!userId || stored.userId === userId)) {
			actorId = stored.userId;
			await prisma.refreshToken.updateMany({
				where: { id: stored.id, revokedAt: null },
				data: { revokedAt: new Date() },
			});
		}
	} else if (userId) {
		await prisma.refreshToken.updateMany({
			where: {
				userId,
				revokedAt: null,
			},
			data: { revokedAt: new Date() },
		});
	}

	if (actorId) {
		await createAuditLog({
			userId: actorId,
			action: "USER_LOGOUT",
			entity: "User",
			entityId: actorId,
		});
	}
};

const forgotPassword = async (payload: ForgotPasswordInput) => {
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findFirst({
		where: { email, deletedAt: null },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (isProtectedDemoAccount(user.email)) {
		throw new AppError(httpStatus.FORBIDDEN, "Password reset is disabled for demo accounts");
	}

	if (!user.emailVerified) {
		throw new AppError(httpStatus.BAD_REQUEST, "Email is not verified");
	}

	// Google-only accounts have no local password — cannot reset via OTP
	if (!user.password || user.authProvider === AuthProvider.GOOGLE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Google accounts cannot use forgot password. Sign in with Google instead.",
		);
	}

	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = otpKeyFor(email);

	await redisClient.set(otpKey, otp, { EX: FORGOT_PASSWORD_OTP_TTL });
	await redisClient.del(otpAttemptsKeyFor(email));

	const templatePath = path.join(process.cwd(), "src/templates/forgot-password-otp.ejs");
	const html = await ejs.renderFile(templatePath, {
		name: user.name,
		otp,
	});

	let emailSent = false;
	let deliveredTo: string | undefined;

	try {
		const mail = await sendMailWithTimeout({
			from: config.smtp.from || config.smtp.user,
			to: email,
			subject: "Forgot Password",
			html,
		});
		emailSent = true;
		deliveredTo = mail.deliveredTo;
	} catch (error) {
		// Keep OTP usable via API fallback when delivery fails
		if (!config.allowOtpInResponse) {
			await redisClient.del(otpKey);
			throw new AppError(
				httpStatus.SERVICE_UNAVAILABLE,
				error instanceof Error
					? error.message
					: "Failed to send OTP email. Please try again later.",
			);
		}
		console.warn("OTP email send failed; returning OTP in response for demo:", error);
	}

	await createAuditLog({
		userId: user.id,
		action: "FORGOT_PASSWORD_OTP_SENT",
		entity: "User",
		entityId: user.id,
		metadata: { emailSent, deliveredTo },
	});

	// When email succeeds, OTP is only in the inbox (same value as Redis) — never also in JSON.
	// A redirected delivery (Resend sandbox) must not reveal the owner's inbox to the requester.
	if (emailSent) {
		const redirected = Boolean(deliveredTo && deliveredTo !== email);
		return {
			email,
			expiresInSeconds: FORGOT_PASSWORD_OTP_TTL,
			emailSent: true as const,
			redirected,
			...(redirected
				? {
						note: `Demo email mode: the OTP for ${email} was sent to the site owner's inbox instead.`,
					}
				: { deliveredTo: email }),
		};
	}

	return {
		email,
		expiresInSeconds: FORGOT_PASSWORD_OTP_TTL,
		emailSent: false as const,
		deliveredTo: undefined as string | undefined,
		otp,
		note: "Email could not be delivered. Use this OTP with /auth/reset-password (it matches Redis).",
	};
};

const resetPassword = async (payload: ResetPasswordInput) => {
	const email = payload.email.trim().toLowerCase();
	const otpKey = otpKeyFor(email);
	const attemptsKey = otpAttemptsKeyFor(email);
	const storedOtp = await redisClient.get(otpKey);

	if (!storedOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	if (storedOtp !== payload.otp) {
		const attempts = await redisClient.incr(attemptsKey);
		if (attempts === 1) {
			await redisClient.expire(attemptsKey, FORGOT_PASSWORD_OTP_TTL);
		}
		if (attempts >= MAX_OTP_ATTEMPTS) {
			await redisClient.del([otpKey, attemptsKey]);
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Too many invalid OTP attempts. Please request a new OTP",
			);
		}
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	const user = await prisma.user.findFirst({
		where: { email, deletedAt: null },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (!user.password || user.authProvider === AuthProvider.GOOGLE) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google accounts cannot reset password this way");
	}

	const hashedPassword = await bcrypt.hash(payload.newPassword, config.bcryptSaltRounds);

	await prisma.user.update({
		where: { id: user.id },
		data: { password: hashedPassword },
	});

	await redisClient.del([otpKey, attemptsKey]);

	await prisma.refreshToken.updateMany({
		where: { userId: user.id, revokedAt: null },
		data: { revokedAt: new Date() },
	});

	await createAuditLog({
		userId: user.id,
		action: "PASSWORD_RESET",
		entity: "User",
		entityId: user.id,
	});
};

export const AuthService = {
	register,
	login,
	googleLogin,
	refresh,
	logout,
	forgotPassword,
	resetPassword,
};
