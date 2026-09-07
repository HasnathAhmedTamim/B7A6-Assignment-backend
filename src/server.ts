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

		// SMTP is optional — Gmail often times out from cloud hosts (e.g. Render).
		// Do not block server boot if verify fails; forgot-password can still try at send time.
		if (config.smtp.user && config.smtp.password) {
			try {
				await transporter.verify();
				console.log("Nodemailer SMTP ready");
			} catch (smtpError) {
				console.warn("SMTP verify skipped/failed (server will still start):", smtpError);
			}
		}

		app.listen(config.port, "0.0.0.0", () => {
			console.log(`Server running on port ${config.port}`);
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

startServer();
