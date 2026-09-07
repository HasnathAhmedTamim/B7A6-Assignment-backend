import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(5000),
	DATABASE_URL: z.string().min(1),
	DIRECT_URL: z.string().min(1).optional(),
	JWT_ACCESS_SECRET: z.string().min(16),
	JWT_REFRESH_SECRET: z.string().min(16),
	JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
	BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),
	FRONTEND_URL: z.string().default("http://localhost:3000"),
	CORS_ORIGIN: z.string().default("http://localhost:3000"),
	BACKEND_URL: z.string().default("http://localhost:5000"),
	GOOGLE_CLIENT_ID: z.string().optional().default(""),
	GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
	STRIPE_SECRET_KEY: z.string().optional().default(""),
	STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
	STRIPE_SUCCESS_URL: z.string().default("http://localhost:3000/payment/success"),
	STRIPE_CANCEL_URL: z.string().default("http://localhost:3000/payment/cancel"),
	ADMIN_EMAIL: z.string().email().optional(),
	ADMIN_PASSWORD: z.string().optional(),
	SMTP_USER: z.string().optional().default(""),
	SMTP_PASSWORD: z.string().optional().default(""),
	REDIS_USERNAME: z.string().optional().default("default"),
	REDIS_PASSWORD: z.string().optional().default(""),
	REDIS_HOST: z.string().optional().default(""),
	REDIS_PORT: z.coerce.number().optional().default(18952),
	CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
	CLOUDINARY_API_KEY: z.string().optional().default(""),
	CLOUDINARY_API_SECRET: z.string().optional().default(""),
	BKASH_USERNAME: z.string().optional().default(""),
	BKASH_PASSWORD: z.string().optional().default(""),
	BKASH_APP_KEY: z.string().optional().default(""),
	BKASH_APP_SECRET: z.string().optional().default(""),
	BKASH_BASE_URL: z
		.string()
		.optional()
		.default("https://tokenized.sandbox.bka.sh/v1.2.0-beta"),
	BKASH_CALLBACK_URL: z.string().optional().default("http://localhost:5000/api/v1"),
	/** When SMTP fails (common on Render), return OTP in API body for demo/reset */
	ALLOW_OTP_IN_RESPONSE: z
		.enum(["true", "false"])
		.optional()
		.default("true")
		.transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
	throw new Error("Invalid environment configuration");
}

const env = parsed.data;

const config = {
	nodeEnv: env.NODE_ENV,
	port: env.PORT,
	databaseUrl: env.DATABASE_URL,
	jwt: {
		accessSecret: env.JWT_ACCESS_SECRET,
		refreshSecret: env.JWT_REFRESH_SECRET,
		accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
		refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
	},
	bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
	frontendUrl: env.FRONTEND_URL,
	corsOrigin: env.CORS_ORIGIN,
	backendUrl: env.BACKEND_URL,
	google: {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
	},
	stripe: {
		secretKey: env.STRIPE_SECRET_KEY,
		webhookSecret: env.STRIPE_WEBHOOK_SECRET,
		successUrl: env.STRIPE_SUCCESS_URL,
		cancelUrl: env.STRIPE_CANCEL_URL,
	},
	admin: {
		email: env.ADMIN_EMAIL,
		password: env.ADMIN_PASSWORD,
	},
	smtp: {
		user: env.SMTP_USER,
		password: env.SMTP_PASSWORD,
	},
	redis: {
		username: env.REDIS_USERNAME,
		password: env.REDIS_PASSWORD,
		host: env.REDIS_HOST,
		port: env.REDIS_PORT,
	},
	cloudinary: {
		cloudName: env.CLOUDINARY_CLOUD_NAME,
		apiKey: env.CLOUDINARY_API_KEY,
		apiSecret: env.CLOUDINARY_API_SECRET,
	},
	bkash: {
		username: env.BKASH_USERNAME,
		password: env.BKASH_PASSWORD,
		appKey: env.BKASH_APP_KEY,
		appSecret: env.BKASH_APP_SECRET,
		baseUrl: env.BKASH_BASE_URL,
		callbackUrl: env.BKASH_CALLBACK_URL,
	},
	allowOtpInResponse: env.ALLOW_OTP_IN_RESPONSE,
	isProduction: env.NODE_ENV === "production",
};

export default config;
