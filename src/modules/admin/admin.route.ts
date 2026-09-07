import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { AdminController } from "./admin.controller.js";
import {
	adminUserIdSchema,
	auditLogQuerySchema,
	updateUserRoleSchema,
	updateUserStatusSchema,
} from "./admin.service.js";

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

router.get("/users", AdminController.getUsers);
router.patch(
	"/users/:id/status",
	validateRequest(adminUserIdSchema, "params"),
	validateRequest(updateUserStatusSchema),
	AdminController.updateUserStatus,
);
router.patch(
	"/users/:id/role",
	validateRequest(adminUserIdSchema, "params"),
	validateRequest(updateUserRoleSchema),
	AdminController.updateUserRole,
);
router.get("/dashboard-stats", AdminController.getDashboardStats);
router.get(
	"/audit-logs",
	validateRequest(auditLogQuerySchema, "query"),
	AdminController.getAuditLogs,
);

export const AdminRoutes = router;
