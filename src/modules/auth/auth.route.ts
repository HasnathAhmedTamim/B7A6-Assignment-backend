import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
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

const router = Router();

router.post("/register", validateRequest(registerSchema), AuthController.register);
router.post("/login", validateRequest(loginSchema), AuthController.login);
router.post("/google", validateRequest(googleLoginSchema), AuthController.googleLogin);
router.post(
	"/refresh-token",
	validateRequest(refreshTokenSchema),
	AuthController.refreshToken,
);
router.post("/logout", authenticate, AuthController.logout);
router.post(
	"/forgot-password",
	validateRequest(forgotPasswordSchema),
	AuthController.forgotPassword,
);
router.post(
	"/reset-password",
	validateRequest(resetPasswordSchema),
	AuthController.resetPassword,
);

export const AuthRoutes = router;
