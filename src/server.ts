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

		if (config.resend.apiKey) {
			console.log("Email ready via Resend API (HTTPS) — works on Render");
		} else if (config.brevo.apiKey) {
			console.log("Email ready via Brevo API (HTTPS) — works on Render");
		} else if (config.smtp.user && config.smtp.password) {
			try {
				await transporter.verify();
				console.log("Nodemailer Connected Successfully. (Gmail SMTP — same as PH Healthcare)");
			} catch (smtpError) {
				console.warn(
					"Gmail SMTP verify failed (expected on Render free tier). Set RESEND_API_KEY for real email:",
					smtpError,
				);
			}
		} else {
			console.warn("Email not configured — set RESEND_API_KEY on Render for live OTP mail");
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
