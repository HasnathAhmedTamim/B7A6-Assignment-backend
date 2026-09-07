import app from "./app.js";
import config from "./config/index.js";
import { prisma } from "./lib/prisma.js";

const startServer = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to PostgreSQL");

		app.listen(config.port, () => {
			console.log(`Server running on port ${config.port}`);
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

startServer();
