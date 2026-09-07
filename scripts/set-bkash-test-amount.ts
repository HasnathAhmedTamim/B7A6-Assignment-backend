import "dotenv/config";
import { BookingStatus, PaymentStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const bookingId = "36d4fb24-8690-49ef-a8f8-fa947bd9d55b";

await prisma.payment.updateMany({
	where: { bookingId },
	data: { status: PaymentStatus.CANCELLED },
});

const booking = await prisma.booking.update({
	where: { id: bookingId },
	data: {
		rentAmount: 1,
		status: BookingStatus.PENDING_PAYMENT,
	},
});

console.log({
	bookingId: booking.id,
	rentAmount: booking.rentAmount.toString(),
	status: booking.status,
});

await prisma.$disconnect();
