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

export type SendMailResult = {
	provider: "resend" | "brevo" | "smtp";
	/** Address Resend/Brevo/SMTP actually delivered to */
	deliveredTo: string;
	/** Original `to` from the caller (account email in forgot-password) */
	intendedTo: string;
	redirected: boolean;
};

const toAddress = (to: SendMailOptions["to"]) =>
	typeof to === "string" ? to : String(to ?? "");

const htmlBody = (html: SendMailOptions["html"]) =>
	typeof html === "string" ? html : String(html ?? "");

const wrapRedirectedHtml = (intendedTo: string, html: string) =>
	`<p><strong>Demo note:</strong> Resend testing delivers here. This OTP is for <code>${intendedTo}</code>.</p>${html}`;

const postResend = async (payload: {
	from: string;
	to: string;
	subject: string;
	html: string;
	signal: AbortSignal;
}) => {
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.resend.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: payload.from,
			to: [payload.to],
			subject: payload.subject,
			html: payload.html,
		}),
		signal: payload.signal,
	});

	const body = await response.text();
	return { response, body };
};

/** Parse Resend 403 "only send … to your own email address (x@y.com)" */
const parseResendAllowedTo = (body: string) => {
	const match = body.match(/your own email address\s*\(([^)]+)\)/i);
	return match?.[1]?.trim().toLowerCase() ?? "";
};

/** Resend HTTPS API — works on Render free tier. */
const sendViaResendApi = async (options: SendMailOptions): Promise<SendMailResult> => {
	const intendedTo = toAddress(options.to).trim().toLowerCase();
	const from = config.resend.from || "Housing Platform <onboarding@resend.dev>";
	if (!intendedTo) {
		throw new Error("Email recipient missing");
	}

	const preferredTo = config.resend.testTo || intendedTo;
	const subjectBase = options.subject || "Housing Platform";

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15_000);

	try {
		const attempt = async (to: string, redirected: boolean) => {
			const html = redirected
				? wrapRedirectedHtml(intendedTo, htmlBody(options.html))
				: htmlBody(options.html);
			const subject = redirected
				? `${subjectBase} (for ${intendedTo})`
				: subjectBase;

			const { response, body } = await postResend({
				from,
				to,
				subject,
				html,
				signal: controller.signal,
			});

			if (response.ok) {
				return {
					provider: "resend" as const,
					deliveredTo: to,
					intendedTo,
					redirected,
				};
			}

			return { ok: false as const, status: response.status, body, to };
		};

		const first = await attempt(preferredTo, preferredTo !== intendedTo);
		if ("provider" in first) {
			return first;
		}

		// Free tier: only account owner is allowed — retry once to that address
		if (first.status === 403 || first.status === 422) {
			const allowed = parseResendAllowedTo(first.body);
			if (allowed && allowed !== first.to) {
				const second = await attempt(allowed, true);
				if ("provider" in second) {
					return second;
				}
				throw new Error(`Resend API ${second.status}: ${second.body}`);
			}
		}

		throw new Error(`Resend API ${first.status}: ${first.body}`);
	} finally {
		clearTimeout(timer);
	}
};

const sendViaBrevoApi = async (options: SendMailOptions): Promise<SendMailResult> => {
	const to = toAddress(options.to).trim().toLowerCase();
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
		return {
			provider: "brevo",
			deliveredTo: to,
			intendedTo: to,
			redirected: false,
		};
	} finally {
		clearTimeout(timer);
	}
};

export const sendMailWithTimeout = async (
	options: SendMailOptions,
	timeoutMs = 20_000,
): Promise<SendMailResult> => {
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

	const intendedTo = toAddress(options.to).trim().toLowerCase();

	await Promise.race([
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

	return {
		provider: "smtp",
		deliveredTo: intendedTo,
		intendedTo,
		redirected: false,
	};
};
