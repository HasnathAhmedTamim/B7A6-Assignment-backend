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

		// Email: Brevo HTTPS API works on Render; SMTP (Gmail) is local-only (Render blocks 465/587).
		if (config.brevo.apiKey) {
			console.log("Email ready via Brevo API (HTTPS)");
		} else if (transporter && config.smtp.user && config.smtp.password) {
			try {
				await transporter.verify();
				console.log("Nodemailer SMTP ready");
			} catch (smtpError) {
				console.warn("SMTP verify skipped/failed (server will still start):", smtpError);
			}
		} else {
			console.warn("Email not configured — set BREVO_API_KEY on Render for real OTP mail");
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
