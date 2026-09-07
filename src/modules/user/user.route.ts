import { Router } from "express";
import { upload } from "../../lib/multer.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { UserController } from "./user.controller.js";
import { updateMeSchema } from "./user.schema.js";

const router = Router();

router.get("/me", authenticate, UserController.getMe);
router.patch("/me", authenticate, validateRequest(updateMeSchema), UserController.updateMe);
router.patch(
	"/profile-image",
	authenticate,
	upload.single("profileImage"),
	UserController.uploadProfileImage,
);

export const UserRoutes = router;
