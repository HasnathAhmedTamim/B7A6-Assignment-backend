import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(5000),
	DATABASE_URL: z.string().min(1),
	JWT_ACCESS_SECRET: z.string().min(16),
	JWT_REFRESH_SECRET: z.string().min(16),
	JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
	BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),
	FRONTEND_URL: z.string().default("http://localhost:3000"),
	CORS_ORIGIN: z.string().default("http://localhost:3000"),
	GOOGLE_CLIENT_ID: z.string().optional().default(""),
	GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
	STRIPE_SECRET_KEY: z.string().optional().default(""),
	STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
	STRIPE_SUCCESS_URL: z.string().default("http://localhost:3000/payment/success"),
	STRIPE_CANCEL_URL: z.string().default("http://localhost:3000/payment/cancel"),
	ADMIN_EMAIL: z.string().email().optional(),
	ADMIN_PASSWORD: z.string().optional(),
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
	isProduction: env.NODE_ENV === "production",
};

export default config;
