import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AuthService } from "./auth.service.js";

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
};

const register = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.register(req.body);
	setAuthCookies(res, result.accessToken, result.refreshToken);
	sendResponse({
		res,
		statusCode: httpStatus.CREATED,
		message: "Registration successful",
		data: result,
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.login(req.body);
	setAuthCookies(res, result.accessToken, result.refreshToken);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
	});
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.googleLogin(req.body);
	setAuthCookies(res, result.accessToken, result.refreshToken);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Google login successful",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const token = req.body.refreshToken || req.cookies?.refreshToken;
	const result = await AuthService.refresh(token);
	setAuthCookies(res, result.accessToken, result.refreshToken);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Token refreshed successfully",
		data: result,
	});
});

const logout = catchAsync(async (req: Request, res: Response) => {
	const token = req.body.refreshToken || req.cookies?.refreshToken;
	await AuthService.logout(req.user!.id, token);
	res.clearCookie("accessToken");
	res.clearCookie("refreshToken");
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Logged out successfully",
		data: null,
	});
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	const data = await AuthService.forgotPassword(req.body);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: data.emailSent
			? "OTP sent to your email"
			: "OTP generated (email SMTP unavailable — use otp from response)",
		data,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.resetPassword(req.body);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Password reset successfully",
		data: null,
	});
});

export const AuthController = {
	register,
	login,
	googleLogin,
	refreshToken,
	logout,
	forgotPassword,
	resetPassword,
};
