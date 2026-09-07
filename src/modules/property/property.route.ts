import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { PropertyController } from "./property.controller.js";
import {
	createPropertySchema,
	propertyIdParamsSchema,
	propertyQuerySchema,
	updatePropertySchema,
} from "./property.schema.js";
import {
	createRoomSchema,
	propertyIdParamSchema,
	roomIdParamSchema,
	updateRoomSchema,
} from "./room.schema.js";

const router = Router();

router.get("/", validateRequest(propertyQuerySchema, "query"), PropertyController.getProperties);
router.get(
	"/:id",
	validateRequest(propertyIdParamsSchema, "params"),
	PropertyController.getPropertyById,
);

router.post(
	"/",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(createPropertySchema),
	PropertyController.createProperty,
);

router.patch(
	"/:id",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(propertyIdParamsSchema, "params"),
	validateRequest(updatePropertySchema),
	PropertyController.updateProperty,
);

router.delete(
	"/:id",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(propertyIdParamsSchema, "params"),
	PropertyController.deleteProperty,
);

router.post(
	"/:propertyId/rooms",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(propertyIdParamSchema, "params"),
	validateRequest(createRoomSchema),
	PropertyController.createRoom,
);

router.get(
	"/:propertyId/rooms",
	validateRequest(propertyIdParamSchema, "params"),
	PropertyController.getRooms,
);

export const PropertyRoutes = router;

export const RoomRoutes = Router();

RoomRoutes.patch(
	"/:id",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(roomIdParamSchema, "params"),
	validateRequest(updateRoomSchema),
	PropertyController.updateRoom,
);

RoomRoutes.delete(
	"/:id",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(roomIdParamSchema, "params"),
	PropertyController.deleteRoom,
);
