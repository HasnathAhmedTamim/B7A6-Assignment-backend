import { PaymentGateway } from "@prisma/client";
import { z } from "zod";

export const initiatePaymentSchema = z.object({
	bookingId: z.string().uuid(),
	gateway: z.nativeEnum(PaymentGateway).default(PaymentGateway.STRIPE),
});

export const paymentIdSchema = z.object({
	id: z.string().uuid(),
});
