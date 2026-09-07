import httpStatus from "http-status";
import Stripe from "stripe";
import config from "../../../config/index.js";
import { AppError } from "../../../utils/AppError.js";
import type {
	CreateCheckoutInput,
	CreateCheckoutResult,
	PaymentGatewayService,
} from "./payment-gateway.interface.js";

export class StripeGateway implements PaymentGatewayService {
	private stripe: Stripe;

	constructor() {
		if (!config.stripe.secretKey) {
			throw new AppError(
				httpStatus.SERVICE_UNAVAILABLE,
				"Stripe is not configured. Set STRIPE_SECRET_KEY in environment.",
			);
		}
		this.stripe = new Stripe(config.stripe.secretKey);
	}

	async createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
		const session = await this.stripe.checkout.sessions.create({
			mode: "payment",
			customer_email: input.customerEmail,
			success_url: input.successUrl ?? config.stripe.successUrl,
			cancel_url: input.cancelUrl ?? config.stripe.cancelUrl,
			client_reference_id: input.merchantReference,
			metadata: input.metadata,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: input.currency,
						unit_amount: Math.round(input.amount * 100),
						product_data: {
							name: `Booking payment ${input.merchantReference}`,
						},
					},
				},
			],
		});

		if (!session.url) {
			throw new AppError(httpStatus.BAD_GATEWAY, "Failed to create Stripe checkout session");
		}

		return {
			gatewayPaymentId: session.id,
			checkoutUrl: session.url,
		};
	}

	constructWebhookEvent(payload: Buffer, signature: string) {
		if (!config.stripe.webhookSecret) {
			throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "Stripe webhook secret is not configured");
		}

		return this.stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
	}
}
