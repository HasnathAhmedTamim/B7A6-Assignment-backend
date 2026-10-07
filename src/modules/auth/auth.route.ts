import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuthenticate } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { AuthController } from "./auth.controller.js";
import {
	forgotPasswordSchema,
	googleLoginSchema,
	loginSchema,
	refreshTokenSchema,
	registerSchema,
	resetPasswordSchema,
} from "./auth.schema.js";

const limiterMessage = {
	success: false,
	message: "Too many attempts, please try again later",
	errors: [],
};

// Only failed attempts count, so repeated demo logins are never blocked
const credentialLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	skipSuccessfulRequests: true,
	standardHeaders: true,
	legacyHeaders: false,
	message: limiterMessage,
});

const otpLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: limiterMessage,
});

const router = Router();

router.post(
	"/register",
	credentialLimiter,
	validateRequest(registerSchema),
	AuthController.register,
);
router.post("/login", credentialLimiter, validateRequest(loginSchema), AuthController.login);
router.post(
	"/google",
	credentialLimiter,
	validateRequest(googleLoginSchema),
	AuthController.googleLogin,
);
router.post("/refresh-token", validateRequest(refreshTokenSchema), AuthController.refreshToken);
router.post("/logout", optionalAuthenticate, AuthController.logout);
router.post(
	"/forgot-password",
	otpLimiter,
	validateRequest(forgotPasswordSchema),
	AuthController.forgotPassword,
);
router.post(
	"/reset-password",
	otpLimiter,
	validateRequest(resetPasswordSchema),
	AuthController.resetPassword,
);

export const AuthRoutes = router;
