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

		// PH Healthcare: await transporter.verify() then crash if fail.
		// On Render, Gmail SMTP always fails — do not block boot; use BREVO_API_KEY for real mail.
		if (config.brevo.apiKey) {
			console.log("Email ready via Brevo API (HTTPS) — use this on Render");
		} else if (config.smtp.user && config.smtp.password) {
			try {
				await transporter.verify();
				console.log("Nodemailer Connected Successfully. (Gmail SMTP — same as PH Healthcare)");
			} catch (smtpError) {
				console.warn(
					"Gmail SMTP verify failed (expected on Render free tier). Set BREVO_API_KEY for real email, or demo OTP locally:",
					smtpError,
				);
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
