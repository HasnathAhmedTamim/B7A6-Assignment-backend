import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { PropertyController } from "./property.controller.js";
import {
	createPropertySchema,
	myPropertyQuerySchema,
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

router.get(
	"/",
	optionalAuthenticate,
	validateRequest(propertyQuerySchema, "query"),
	PropertyController.getProperties,
);

// Must be registered before "/:id"
router.get(
	"/my",
	authenticate,
	authorize(Role.LANDLORD, Role.ADMIN),
	validateRequest(myPropertyQuerySchema, "query"),
	PropertyController.getMyProperties,
);

router.get(
	"/:id",
	optionalAuthenticate,
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
	optionalAuthenticate,
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
