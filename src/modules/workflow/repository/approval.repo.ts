import type { PrismaClient } from "@prisma/client";

export async function getApprovalsByWorkflow(prisma: PrismaClient, workflowId: string) {
  return prisma.approvalRequest.findMany({
    where: { workflowId },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
}

export async function getApprovalsByQuote(prisma: PrismaClient, quoteId: string) {
  return prisma.approvalRequest.findMany({
    where: { quoteId },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPendingApprovalsByRole(prisma: PrismaClient, requiredRole: string) {
  return prisma.approvalRequest.findMany({
    where: { requiredRole, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getExpiredApprovals(prisma: PrismaClient) {
  return prisma.approvalRequest.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
  });
}
