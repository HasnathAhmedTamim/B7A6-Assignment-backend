import httpStatus from "http-status";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { redisClient } from "./redis.js";

const ID_TOKEN_KEY = "bkash:idToken";
const REFRESH_TOKEN_KEY = "bkash:refreshToken";

export const getBkashIdToken = async () => {
	try {
		let bkashIdToken = await redisClient.get(ID_TOKEN_KEY);
		const bkashIdTokenTTL = await redisClient.ttl(ID_TOKEN_KEY);
		const bkashRefreshToken = await redisClient.get(REFRESH_TOKEN_KEY);
		const bkashRefreshTokenTTL = await redisClient.ttl(REFRESH_TOKEN_KEY);

		if (
			(bkashIdTokenTTL <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTTL > 600
		) {
			const refreshTokenResponse = await fetch(
				`${config.bkash.baseUrl}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: config.bkash.username,
						password: config.bkash.password,
					},
					body: JSON.stringify({
						app_key: config.bkash.appKey,
						app_secret: config.bkash.appSecret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);

			if (!refreshTokenResponse.ok) {
				throw new AppError(httpStatus.BAD_GATEWAY, "bKash access token refresh failed");
			}

			const refreshResult = (await refreshTokenResponse.json()) as {
				id_token: string;
			};

			bkashIdToken = refreshResult.id_token;
			await redisClient.set(ID_TOKEN_KEY, bkashIdToken, { EX: 60 * 60 });
			return bkashIdToken;
		}

		if (bkashIdToken && bkashIdTokenTTL > 600) {
			return bkashIdToken;
		}

		const response = await fetch(`${config.bkash.baseUrl}/tokenized/checkout/token/grant`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				username: config.bkash.username,
				password: config.bkash.password,
			},
			body: JSON.stringify({
				app_key: config.bkash.appKey,
				app_secret: config.bkash.appSecret,
			}),
		});

		if (!response.ok) {
			throw new AppError(httpStatus.BAD_GATEWAY, "bKash access token grant failed");
		}

		const result = (await response.json()) as {
			id_token: string;
			refresh_token: string;
		};

		await redisClient.set(ID_TOKEN_KEY, result.id_token, { EX: 60 * 60 });
		await redisClient.set(REFRESH_TOKEN_KEY, result.refresh_token, {
			EX: 60 * 60 * 24 * 28,
		});

		return result.id_token;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			error instanceof Error ? error.message : "bKash token error",
		);
	}
};
