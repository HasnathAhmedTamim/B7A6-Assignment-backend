import "dotenv/config";
import { AuthProvider, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const credentialUpdated = await prisma.user.updateMany({
	where: { password: { not: null } },
	data: { emailVerified: true, authProvider: AuthProvider.CREDENTIAL },
});

const googleUpdated = await prisma.user.updateMany({
	where: { googleId: { not: null }, password: null },
	data: { emailVerified: true, authProvider: AuthProvider.GOOGLE },
});

console.log({ credentialUpdated: credentialUpdated.count, googleUpdated: googleUpdated.count });
await prisma.$disconnect();
