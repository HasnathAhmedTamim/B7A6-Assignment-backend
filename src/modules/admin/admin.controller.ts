import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AdminService } from "./admin.service.js";

const getUsers = catchAsync(async (_req: Request, res: Response) => {
	const data = await AdminService.getUsers();
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Users fetched successfully",
		data,
	});
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
	const data = await AdminService.updateUserStatus(
		req.user!,
		req.params.id as string,
		req.body.status,
	);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "User status updated successfully",
		data,
	});
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
	const data = await AdminService.updateUserRole(req.user!, req.params.id as string, req.body.role);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "User role updated successfully",
		data,
	});
});

const getDashboardStats = catchAsync(async (_req: Request, res: Response) => {
	const data = await AdminService.getDashboardStats();
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Dashboard stats fetched successfully",
		data,
	});
});

const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const page = Number(req.query.page ?? 1);
	const limit = Number(req.query.limit ?? 20);
	const result = await AdminService.getAuditLogs(page, limit);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Audit logs fetched successfully",
		meta: result.meta,
		data: result.data,
	});
});

export const AdminController = {
	getUsers,
	updateUserStatus,
	updateUserRole,
	getDashboardStats,
	getAuditLogs,
};
