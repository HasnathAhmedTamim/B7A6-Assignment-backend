import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { BookingService } from "./booking.service.js";

const getMyBookings = catchAsync(async (req: Request, res: Response) => {
	const data = await BookingService.getMyBookings(req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Bookings fetched successfully",
		data,
	});
});

const getBookingById = catchAsync(async (req: Request, res: Response) => {
	const data = await BookingService.getBookingById(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Booking fetched successfully",
		data,
	});
});

const cancelBooking = catchAsync(async (req: Request, res: Response) => {
	const data = await BookingService.cancelBooking(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Booking cancelled successfully",
		data,
	});
});

export const BookingController = {
	getMyBookings,
	getBookingById,
	cancelBooking,
};
