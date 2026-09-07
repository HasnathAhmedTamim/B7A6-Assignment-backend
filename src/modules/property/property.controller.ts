import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PropertyService } from "./property.service.js";
import { RoomService } from "./room.service.js";

const createProperty = catchAsync(async (req: Request, res: Response) => {
	const property = await PropertyService.createProperty(req.user!, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.CREATED,
		message: "Property created successfully",
		data: property,
	});
});

const getProperties = catchAsync(async (req: Request, res: Response) => {
	const result = await PropertyService.getProperties(req.query as never);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Properties fetched successfully",
		meta: result.meta,
		data: result.data,
	});
});

const getPropertyById = catchAsync(async (req: Request, res: Response) => {
	const property = await PropertyService.getPropertyById(req.params.id as string);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Property fetched successfully",
		data: property,
	});
});

const updateProperty = catchAsync(async (req: Request, res: Response) => {
	const property = await PropertyService.updateProperty(
		req.params.id as string,
		req.user!,
		req.body,
	);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Property updated successfully",
		data: property,
	});
});

const deleteProperty = catchAsync(async (req: Request, res: Response) => {
	const property = await PropertyService.deleteProperty(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Property deleted successfully",
		data: property,
	});
});

const createRoom = catchAsync(async (req: Request, res: Response) => {
	const room = await RoomService.createRoom(req.params.propertyId as string, req.user!, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.CREATED,
		message: "Room created successfully",
		data: room,
	});
});

const getRooms = catchAsync(async (req: Request, res: Response) => {
	const rooms = await RoomService.getRoomsByProperty(req.params.propertyId as string);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Rooms fetched successfully",
		data: rooms,
	});
});

const updateRoom = catchAsync(async (req: Request, res: Response) => {
	const room = await RoomService.updateRoom(req.params.id as string, req.user!, req.body);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Room updated successfully",
		data: room,
	});
});

const deleteRoom = catchAsync(async (req: Request, res: Response) => {
	const room = await RoomService.deleteRoom(req.params.id as string, req.user!);
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Room deleted successfully",
		data: room,
	});
});

export const PropertyController = {
	createProperty,
	getProperties,
	getPropertyById,
	updateProperty,
	deleteProperty,
	createRoom,
	getRooms,
	updateRoom,
	deleteRoom,
};
