import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { UserController } from "./user.controller.js";
import { updateMeSchema } from "./user.schema.js";

const router = Router();

router.get("/me", authenticate, UserController.getMe);
router.patch("/me", authenticate, validateRequest(updateMeSchema), UserController.updateMe);

export const UserRoutes = router;
