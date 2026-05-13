import type { PrismaClient } from "@prisma/client";
import type { EventKind } from "../types/event.types";

export async function getEventsByQuote(
  prisma: PrismaClient,
  quoteId: string,
): Promise<{ id: string; kind: EventKind; occurredAt: Date; payload: unknown }[]> {
  const events = await prisma.commercialEvent.findMany({
    where: { quoteId },
    orderBy: { occurredAt: "asc" },
  });
  return events.map((e) => ({ ...e, kind: e.kind as EventKind }));
}

export async function getEventsByKind(
  prisma: PrismaClient,
  kind: EventKind,
  limitDays?: number,
): Promise<{ id: string; quoteId: string | null; customerId: string | null; occurredAt: Date; payload: unknown }[]> {
  const where = {
    kind,
    ...(limitDays ? { occurredAt: { gte: new Date(Date.now() - limitDays * 86400000) } } : {}),
  };
  const events = await prisma.commercialEvent.findMany({ where, orderBy: { occurredAt: "desc" } });
  return events;
}

export async function countEventsByKind(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<Record<string, number>> {
  const events = await prisma.commercialEvent.groupBy({
    by: ["kind"],
    _count: { id: true },
    ...(periodDays ? { where: { occurredAt: { gte: new Date(Date.now() - periodDays * 86400000) } } } : {}),
  });
  return Object.fromEntries(events.map((e) => [e.kind, e._count.id]));
}
