import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import config from "../config/index.js";

/**
 * Render free tier blocks outbound SMTP (25/465/587). Prefer Brevo HTTPS API (BREVO_API_KEY).
 * Locally: leave BREVO_API_KEY empty and use Gmail App Password via SMTP_USER / SMTP_PASSWORD.
 */
export const transporter: Transporter | null =
	config.brevo.apiKey || !config.smtp.user
		? null
		: config.smtp.host
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

const parseFrom = (from: string | undefined) => {
	const raw = (from || config.smtp.from || config.smtp.user || "").trim();
	const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
	if (match?.[1] && match[2]) {
		return {
			name: match[1].replace(/^["']|["']$/g, "").trim() || "Housing Platform",
			email: match[2].trim(),
		};
	}
	return { name: "Housing Platform", email: raw };
};

const normalizeRecipients = (to: SendMailOptions["to"]): { email: string; name?: string }[] => {
	const entries = Array.isArray(to) ? to : [to];
	const recipients: { email: string; name?: string }[] = [];

	for (const entry of entries) {
		if (!entry) continue;
		if (typeof entry === "string") {
			recipients.push({ email: entry });
			continue;
		}
		if (typeof entry === "object" && "address" in entry && typeof entry.address === "string") {
			recipients.push({ email: entry.address, name: entry.name });
		}
	}

	return recipients;
};

const sendViaBrevoApi = async (options: SendMailOptions) => {
	const recipients = normalizeRecipients(options.to);

	if (!recipients.length) {
		throw new Error("Email recipient is missing");
	}

	const sender = parseFrom(typeof options.from === "string" ? options.from : undefined);
	if (!sender.email) {
		throw new Error("SMTP_FROM / sender email is required for Brevo API");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 12_000);

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
				to: recipients,
				subject: options.subject,
				htmlContent: options.html,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Brevo API ${response.status}: ${body}`);
		}

		return response.json();
	} finally {
		clearTimeout(timer);
	}
};

/** Prefer Brevo HTTPS API on Render; fall back to Nodemailer SMTP locally. */
export const sendMailWithTimeout = async (options: SendMailOptions, timeoutMs = 12_000) => {
	if (config.brevo.apiKey) {
		return sendViaBrevoApi(options);
	}

	if (!transporter) {
		throw new Error("Email is not configured. Set BREVO_API_KEY (Render) or SMTP_USER/SMTP_PASSWORD (local).");
	}

	return Promise.race([
		transporter.sendMail(options),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error("Email send timed out. Check SMTP credentials / network."));
			}, timeoutMs);
		}),
	]);
};
