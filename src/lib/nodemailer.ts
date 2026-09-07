import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import config from "../config/index.js";

/**
 * Local (same as PH Healthcare): Gmail App Password via Nodemailer.
 * Render free: SMTP blocked — set BREVO_API_KEY to send over HTTPS.
 */
export const transporter: Transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.smtp.user,
		pass: config.smtp.password,
	},
});

const parseSender = () => {
	const raw = (config.smtp.from || config.smtp.user || "").trim();
	const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
	if (match?.[1] && match[2]) {
		return {
			name: match[1].replace(/^["']|["']$/g, "").trim() || "Housing Platform",
			email: match[2].trim(),
		};
	}
	return { name: "Housing Platform", email: raw };
};

const sendViaBrevoApi = async (options: SendMailOptions) => {
	const to = typeof options.to === "string" ? options.to : String(options.to ?? "");
	const sender = parseSender();
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
				htmlContent: typeof options.html === "string" ? options.html : String(options.html ?? ""),
			}),
			signal: controller.signal,
		});

		const body = await response.text();
		if (!response.ok) {
			// Common Brevo account issues
			if (response.status === 401) {
				throw new Error(
					`Brevo unauthorized (401). Check BREVO_API_KEY, and disable IP allowlist or authorize Render IPs. ${body}`,
				);
			}
			if (response.status === 400 && /sender|unrecognised|recognized/i.test(body)) {
				throw new Error(
					`Brevo sender not verified. Verify ${sender.email} under Senders in Brevo. ${body}`,
				);
			}
			throw new Error(`Brevo API ${response.status}: ${body}`);
		}

		return body ? JSON.parse(body) : {};
	} finally {
		clearTimeout(timer);
	}
};

export const sendMailWithTimeout = async (options: SendMailOptions, timeoutMs = 20_000) => {
	if (config.brevo.apiKey) {
		return sendViaBrevoApi(options);
	}

	if (!config.smtp.user || !config.smtp.password) {
		throw new Error("Email not configured. Set BREVO_API_KEY (Render) or SMTP_USER/SMTP_PASSWORD (local).");
	}

	return Promise.race([
		transporter.sendMail({
			...options,
			from: options.from || config.smtp.from || config.smtp.user,
		}),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error("Email send timed out. Gmail SMTP blocked on this host — use BREVO_API_KEY on Render."));
			}, timeoutMs);
		}),
	]);
};
