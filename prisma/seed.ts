import "dotenv/config";
import { AuthProvider, PrismaClient, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getDemoAccounts } from "../src/config/demoAccounts.js";

const prisma = new PrismaClient();

async function main() {
	const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

	for (const account of getDemoAccounts()) {
		const hashedPassword = await bcrypt.hash(account.password, saltRounds);

		// Upsert also repairs a demo account that was blocked, re-roled, or had its password changed
		const user = await prisma.user.upsert({
			where: { email: account.email },
			update: {
				name: account.name,
				password: hashedPassword,
				role: account.role,
				status: UserStatus.ACTIVE,
				authProvider: AuthProvider.CREDENTIAL,
				emailVerified: true,
				deletedAt: null,
			},
			create: {
				name: account.name,
				email: account.email,
				password: hashedPassword,
				phone: account.phone,
				role: account.role,
				status: UserStatus.ACTIVE,
				authProvider: AuthProvider.CREDENTIAL,
				emailVerified: true,
			},
		});

		console.log(`Demo ${account.role} ready: ${user.email}`);
	}
}

main()
	.catch((error) => {
		console.error("Seed failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
