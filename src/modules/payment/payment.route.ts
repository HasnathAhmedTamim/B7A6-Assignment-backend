import { Role } from "@prisma/client";
import express, { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { PaymentController } from "./payment.controller.js";
import { initiatePaymentSchema, paymentIdSchema } from "./payment.schema.js";

const router = Router();

router.post("/webhook", express.raw({ type: "application/json" }), PaymentController.stripeWebhook);
router.get("/bkash/callback", PaymentController.bkashCallback);

router.post(
	"/initiate",
	authenticate,
	authorize(Role.TENANT, Role.ADMIN),
	validateRequest(initiatePaymentSchema),
	PaymentController.initiatePayment,
);

router.get(
	"/my",
	authenticate,
	authorize(Role.TENANT, Role.ADMIN),
	PaymentController.getMyPayments,
);

router.get(
	"/:id",
	authenticate,
	authorize(Role.TENANT, Role.LANDLORD, Role.ADMIN),
	validateRequest(paymentIdSchema, "params"),
	PaymentController.getPaymentById,
);

export const PaymentRoutes = router;
