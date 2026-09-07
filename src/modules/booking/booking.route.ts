import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { BookingController } from "./booking.controller.js";
import { bookingIdSchema } from "./booking.service.js";

const router = Router();

router.get(
	"/my",
	authenticate,
	authorize(Role.TENANT, Role.LANDLORD, Role.ADMIN),
	BookingController.getMyBookings,
);

router.get(
	"/:id",
	authenticate,
	authorize(Role.TENANT, Role.LANDLORD, Role.ADMIN),
	validateRequest(bookingIdSchema, "params"),
	BookingController.getBookingById,
);

router.patch(
	"/:id/cancel",
	authenticate,
	authorize(Role.TENANT, Role.LANDLORD, Role.ADMIN),
	validateRequest(bookingIdSchema, "params"),
	BookingController.cancelBooking,
);

export const BookingRoutes = router;
