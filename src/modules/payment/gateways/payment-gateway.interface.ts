import type Stripe from "stripe";

export interface CreateCheckoutInput {
	amount: number;
	currency: string;
	merchantReference: string;
	customerEmail: string;
	metadata: Record<string, string>;
	successUrl: string;
	cancelUrl: string;
}

export interface CreateCheckoutResult {
	gatewayPaymentId: string;
	checkoutUrl: string;
}

export interface PaymentGatewayService {
	createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
	constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event;
}

/**
 * Future real bKash gateway should implement PaymentGatewayService.
 * Do not add fake bKash URLs or simulated success here.
 */
export class BkashGateway implements Partial<PaymentGatewayService> {
	createCheckoutSession(): Promise<CreateCheckoutResult> {
		return Promise.reject(
			new Error("bKash gateway is not implemented yet. Use Stripe for payments."),
		);
	}
}
