import app from "./app.js";
import config from "./config/index.js";
import { transporter } from "./lib/nodemailer.js";
import { prisma } from "./lib/prisma.js";
import { redisClient } from "./lib/redis.js";

const startServer = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to PostgreSQL");

		await redisClient.connect();
		console.log("Connected to Redis");

		if (config.smtp.user && config.smtp.password) {
			await transporter.verify();
			console.log("Nodemailer SMTP ready");
		}

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
