import "dotenv/config";
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

	if (!email || !password) {
		throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
	}

	const hashedPassword = await bcrypt.hash(password, saltRounds);

	const admin = await prisma.user.upsert({
		where: { email },
		update: {
			name: "Platform Admin",
			password: hashedPassword,
			role: Role.ADMIN,
			status: UserStatus.ACTIVE,
			deletedAt: null,
		},
		create: {
			name: "Platform Admin",
			email,
			password: hashedPassword,
			role: Role.ADMIN,
			status: UserStatus.ACTIVE,
		},
	});

	console.log(`Demo admin ready: ${admin.email}`);
}

main()
	.catch((error) => {
		console.error("Seed failed:", error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
