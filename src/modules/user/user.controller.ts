import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { UserService } from "./user.service.js";

const getMe = catchAsync(async (req: Request, res: Response) => {
	const user = await UserService.getMe(req.user!.id);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Profile fetched successfully",
		data: user,
	});
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
	const user = await UserService.updateMe(req.user!.id, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Profile updated successfully",
		data: user,
	});
});

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
	const user = await UserService.uploadProfileImage(
		req.user!.id,
		req.file as Express.Multer.File | undefined,
	);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Profile image updated successfully",
		data: user,
	});
});

export const UserController = {
	getMe,
	updateMe,
	uploadProfileImage,
};
