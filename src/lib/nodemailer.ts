import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import config from "../config/index.js";

/**
 * Prefer SMTP_HOST (Brevo / Resend / Mailgun) on cloud hosts — Gmail SMTP is often blocked (e.g. Render).
 * Locally you can leave SMTP_HOST empty and use Gmail + App Password.
 */
export const transporter: Transporter = config.smtp.host
	? nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.secure,
			auth: {
				user: config.smtp.user,
				pass: config.smtp.password,
			},
			connectionTimeout: 8_000,
			greetingTimeout: 8_000,
			socketTimeout: 10_000,
		})
	: nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: config.smtp.user,
				pass: config.smtp.password,
			},
			connectionTimeout: 8_000,
			greetingTimeout: 8_000,
			socketTimeout: 10_000,
		});

/** Fail fast so Postman / clients do not hang forever on SMTP. */
export const sendMailWithTimeout = async (options: SendMailOptions, timeoutMs = 12_000) => {
	return Promise.race([
		transporter.sendMail(options),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error("Email send timed out. Check SMTP credentials / network."));
			}, timeoutMs);
		}),
	]);
};
