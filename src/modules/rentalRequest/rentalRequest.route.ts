import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { RentalRequestController } from "./rentalRequest.controller.js";
import { createRentalRequestSchema, rentalRequestIdSchema } from "./rentalRequest.schema.js";

const router = Router();

router.post(
	"/",
	authenticate,
	authorize(Role.TENANT),
	validateRequest(createRentalRequestSchema),
	RentalRequestController.createRequest,
);

router.get(
	"/my",
	authenticate,
	authorize(Role.TENANT, Role.ADMIN),
	RentalRequestController.getMyRequests,
);

router.get(
	"/received",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	RentalRequestController.getReceivedRequests,
);

router.patch(
	"/:id/approve",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(rentalRequestIdSchema, "params"),
	RentalRequestController.approveRequest,
);

router.patch(
	"/:id/reject",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(rentalRequestIdSchema, "params"),
	RentalRequestController.rejectRequest,
);

router.patch(
	"/:id/cancel",
	authenticate,
	authorize(Role.TENANT, Role.ADMIN),
	validateRequest(rentalRequestIdSchema, "params"),
	RentalRequestController.cancelRequest,
);

export const RentalRequestRoutes = router;
