import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import config from "../config/index.js";

/**
 * Local: Gmail App Password (same as PH Healthcare).
 * Render: set RESEND_API_KEY or BREVO_API_KEY (HTTPS — SMTP ports are blocked).
 */
export const transporter: Transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.smtp.user,
		pass: config.smtp.password,
	},
});

const toAddress = (to: SendMailOptions["to"]) =>
	typeof to === "string" ? to : String(to ?? "");

const htmlBody = (html: SendMailOptions["html"]) =>
	typeof html === "string" ? html : String(html ?? "");

/** Resend HTTPS API — works on Render free tier. */
const sendViaResendApi = async (options: SendMailOptions) => {
	const to = toAddress(options.to);
	const from = config.resend.from || "Housing Platform <onboarding@resend.dev>";
	if (!to) {
		throw new Error("Email recipient missing");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);

	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.resend.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [to],
				subject: options.subject || "Housing Platform",
				html: htmlBody(options.html),
			}),
			signal: controller.signal,
		});

		const body = await response.text();
		if (!response.ok) {
			throw new Error(`Resend API ${response.status}: ${body}`);
		}
		return body ? JSON.parse(body) : {};
	} finally {
		clearTimeout(timer);
	}
};

const sendViaBrevoApi = async (options: SendMailOptions) => {
	const to = toAddress(options.to);
	const rawFrom = (config.smtp.from || config.smtp.user || "").trim();
	const match = rawFrom.match(/^(.*?)\s*<([^>]+)>$/);
	const sender = match?.[1] && match[2]
		? {
				name: match[1].replace(/^["']|["']$/g, "").trim() || "Housing Platform",
				email: match[2].trim(),
			}
		: { name: "Housing Platform", email: rawFrom };

	if (!sender.email || !to) {
		throw new Error("Email sender/recipient missing. Set SMTP_FROM or SMTP_USER.");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);

	try {
		const response = await fetch("https://api.brevo.com/v3/smtp/email", {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"api-key": config.brevo.apiKey,
			},
			body: JSON.stringify({
				sender,
				to: [{ email: to }],
				subject: options.subject || "Housing Platform",
				htmlContent: htmlBody(options.html),
			}),
			signal: controller.signal,
		});

		const body = await response.text();
		if (!response.ok) {
			throw new Error(`Brevo API ${response.status}: ${body}`);
		}
		return body ? JSON.parse(body) : {};
	} finally {
		clearTimeout(timer);
	}
};

export const sendMailWithTimeout = async (options: SendMailOptions, timeoutMs = 20_000) => {
	if (config.resend.apiKey) {
		return sendViaResendApi(options);
	}
	if (config.brevo.apiKey) {
		return sendViaBrevoApi(options);
	}

	if (!config.smtp.user || !config.smtp.password) {
		throw new Error(
			"Email not configured. Set RESEND_API_KEY (Render) or SMTP_USER/SMTP_PASSWORD (local).",
		);
	}

	return Promise.race([
		transporter.sendMail({
			...options,
			from: options.from || config.smtp.from || config.smtp.user,
		}),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new Error(
						"Email send timed out. Gmail SMTP blocked on Render — set RESEND_API_KEY.",
					),
				);
			}, timeoutMs);
		}),
	]);
};
