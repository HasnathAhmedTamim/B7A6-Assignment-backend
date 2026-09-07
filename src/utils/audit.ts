import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

interface AuditInput {
	userId?: string | null;
	action: string;
	entity: string;
	entityId?: string | null;
	metadata?: Prisma.InputJsonValue;
}

export const createAuditLog = async (input: AuditInput) => {
	await prisma.auditLog.create({
		data: {
			userId: input.userId ?? null,
			action: input.action,
			entity: input.entity,
			entityId: input.entityId ?? null,
			metadata: input.metadata,
		},
	});
};
