import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import helmet from "helmet";
import httpStatus from "http-status";
import config from "./config/index.js";
import { globalErrorHandler } from "./middlewares/error.middleware.js";
import { notFound } from "./middlewares/notFound.middleware.js";
import { router } from "./routes/index.js";
import { sendResponse } from "./utils/sendResponse.js";

const app: Application = express();

app.set("trust proxy", 1);

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
				frameSrc: ["'self'", "https://accounts.google.com"],
				connectSrc: ["'self'", "https://accounts.google.com"],
				styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
				imgSrc: ["'self'", "data:", "https:"],
			},
		},
		crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
	}),
);
app.use(
	cors({
		origin: config.corsOrigin.split(",").map((origin) => origin.trim()),
		credentials: true,
	}),
);

app.use(
	rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 300,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			success: false,
			message: "Too many requests, please try again later",
			errors: [],
		},
	}),
);

// Stripe webhook needs raw body — mount later in payment routes before express.json
app.use((req, res, next) => {
	if (req.originalUrl === "/api/v1/payments/webhook") {
		return next();
	}
	return express.json()(req, res, next);
});

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Server is healthy",
		data: { status: "ok" },
	});
});

// Dev helper: get a real Google ID token for Postman testing
app.get("/google-signin", (_req, res) => {
	const templatePath = path.join(process.cwd(), "public", "google-signin.html");
	const html = fs
		.readFileSync(templatePath, "utf8")
		.replaceAll("__GOOGLE_CLIENT_ID__", config.google.clientId || "");
	res.status(httpStatus.OK).type("html").send(html);
});

app.get("/", (_req, res) => {
	sendResponse({
		res,
		statusCode: httpStatus.OK,
		message: "Housing & Roommate Management Platform API",
		data: {
			version: "v1",
			docs: "See README and Postman collection",
		},
	});
});

app.use("/api/v1", router);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
