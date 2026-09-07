export interface CreateCheckoutInput {
	amount: number;
	currency: string;
	merchantReference: string;
	customerEmail: string;
	metadata: Record<string, string>;
	successUrl?: string;
	cancelUrl?: string;
}

export interface CreateCheckoutResult {
	gatewayPaymentId: string;
	checkoutUrl: string;
	raw?: unknown;
}

export interface PaymentGatewayService {
	createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
}
