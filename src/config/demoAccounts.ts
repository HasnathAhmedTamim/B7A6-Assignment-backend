import { Role } from "@prisma/client";

export interface DemoAccount {
	role: Role;
	name: string;
	email: string;
	password: string;
	phone: string;
}

type Env = Record<string, string | undefined>;

/** Evaluation accounts created by `prisma/seed.ts`; override any value through env. */
export const getDemoAccounts = (env: Env = process.env): DemoAccount[] => [
	{
		role: Role.ADMIN,
		name: "Platform Admin",
		email: (env.ADMIN_EMAIL || "admin@housing.com").trim().toLowerCase(),
		password: env.ADMIN_PASSWORD || "ChangeMeAdmin123!",
		phone: "01700000000",
	},
	{
		role: Role.LANDLORD,
		name: "Demo Landlord",
		email: (env.DEMO_LANDLORD_EMAIL || "landlord@housing.com").trim().toLowerCase(),
		password: env.DEMO_LANDLORD_PASSWORD || "Landlord123!",
		phone: "01700000001",
	},
	{
		role: Role.TENANT,
		name: "Demo Tenant",
		email: (env.DEMO_TENANT_EMAIL || "tenant@housing.com").trim().toLowerCase(),
		password: env.DEMO_TENANT_PASSWORD || "Tenant123!",
		phone: "01700000002",
	},
];
