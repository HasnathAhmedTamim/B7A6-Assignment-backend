import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PaymentService } from "./payment.service.js";

const initiatePayment = catchAsync(async (req: Request, res: Response) => {
	const data = await PaymentService.initiatePayment(req.user!, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Stripe checkout session created",
		data,
	});
});

const stripeWebhook = catchAsync(async (req: Request, res: Response) => {
	const signature = req.headers["stripe-signature"];
	const rawBody = req.body as Buffer;
	const data = await PaymentService.handleStripeWebhook(
		rawBody,
		typeof signature === "string" ? signature : undefined,
	);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Webhook processed",
		data,
	});
});

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
	const data = await PaymentService.getMyPayments(req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Payments fetched successfully",
		data,
	});
});

const getPaymentById = catchAsync(async (req: Request, res: Response) => {
	const data = await PaymentService.getPaymentById(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Payment fetched successfully",
		data,
	});
});

export const PaymentController = {
	initiatePayment,
	stripeWebhook,
	getMyPayments,
	getPaymentById,
};
