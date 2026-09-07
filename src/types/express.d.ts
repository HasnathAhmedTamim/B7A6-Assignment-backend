import type { Role } from "@prisma/client";
import type { AuthUser } from "./auth.js";

declare global {
	namespace Express {
		interface Request {
			user?: AuthUser;
		}
	}
}

export type { AuthUser, Role };
