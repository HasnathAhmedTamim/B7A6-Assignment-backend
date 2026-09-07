import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { RentalRequestService } from "./rentalRequest.service.js";

const createRequest = catchAsync(async (req: Request, res: Response) => {
	const result = await RentalRequestService.createRequest(req.user!, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.CREATED,
		message: "Rental request submitted successfully",
		data: result,
	});
});

const getMyRequests = catchAsync(async (req: Request, res: Response) => {
	const data = await RentalRequestService.getMyRequests(req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Your rental requests fetched successfully",
		data,
	});
});

const getReceivedRequests = catchAsync(async (req: Request, res: Response) => {
	const data = await RentalRequestService.getReceivedRequests(req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Received rental requests fetched successfully",
		data,
	});
});

const approveRequest = catchAsync(async (req: Request, res: Response) => {
	const data = await RentalRequestService.approveRequest(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Rental request approved and booking created",
		data,
	});
});

const rejectRequest = catchAsync(async (req: Request, res: Response) => {
	const data = await RentalRequestService.rejectRequest(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Rental request rejected",
		data,
	});
});

const cancelRequest = catchAsync(async (req: Request, res: Response) => {
	const data = await RentalRequestService.cancelRequest(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Rental request cancelled",
		data,
	});
});

export const RentalRequestController = {
	createRequest,
	getMyRequests,
	getReceivedRequests,
	approveRequest,
	rejectRequest,
	cancelRequest,
};
