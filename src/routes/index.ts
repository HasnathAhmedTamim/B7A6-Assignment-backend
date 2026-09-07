import { Router } from "express";
import { AdminRoutes } from "../modules/admin/admin.route.js";
import { AuthRoutes } from "../modules/auth/auth.route.js";
import { BookingRoutes } from "../modules/booking/booking.route.js";
import { PaymentRoutes } from "../modules/payment/payment.route.js";
import { PropertyRoutes, RoomRoutes } from "../modules/property/property.route.js";
import { RentalRequestRoutes } from "../modules/rentalRequest/rentalRequest.route.js";
import { UserRoutes } from "../modules/user/user.route.js";

export const router = Router();

router.use("/auth", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/properties", PropertyRoutes);
router.use("/rooms", RoomRoutes);
router.use("/rental-requests", RentalRequestRoutes);
router.use("/bookings", BookingRoutes);
router.use("/payments", PaymentRoutes);
router.use("/admin", AdminRoutes);
