import httpStatus from "http-status";
import config from "../../../config/index.js";
import { getBkashIdToken } from "../../../lib/bkash.js";
import { AppError } from "../../../utils/AppError.js";
import type {
	CreateCheckoutInput,
	CreateCheckoutResult,
	PaymentGatewayService,
} from "./payment-gateway.interface.js";

export class BkashGateway implements PaymentGatewayService {
	async createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
		if (
			!config.bkash.username ||
			!config.bkash.password ||
			!config.bkash.appKey ||
			!config.bkash.appSecret
		) {
			throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "bKash is not configured");
		}

		const idToken = await getBkashIdToken();

		const response = await fetch(`${config.bkash.baseUrl}/tokenized/checkout/create`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: idToken,
				"X-App-Key": config.bkash.appKey,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: input.customerEmail,
				callbackURL: `${config.bkash.callbackUrl}/payments/bkash/callback`,
				amount: input.amount.toFixed(2),
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: input.merchantReference.slice(0, 255),
			}),
		});

		const result = (await response.json()) as {
			statusCode?: string;
			statusMessage?: string;
			paymentID?: string;
			bkashURL?: string;
			errorMessage?: string;
		};

		if (!result.paymentID || !result.bkashURL) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				result.statusMessage || result.errorMessage || "Failed to create bKash payment",
			);
		}

		return {
			gatewayPaymentId: result.paymentID,
			checkoutUrl: result.bkashURL,
			raw: result,
		};
	}
}
