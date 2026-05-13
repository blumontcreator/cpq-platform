import type { User as AuthUser } from "@supabase/supabase-js";
import type { User as DbUser } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Links Supabase Auth to a Prisma `User` row.
 *
 * RBAC: `CpqRole` always comes from Prisma — never from JWT `user_metadata`
 * (user-editable in Supabase).
 */
export async function syncAuthUserToPrisma(authUser: AuthUser): Promise<DbUser> {
  const email = authUser.email;
  if (!email) {
    throw new Error("Authenticated user has no email — cannot provision CPQ operator.");
  }

  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { authSubject: authUser.id },
        { email: { equals: normalizedEmail, mode: "insensitive" } },
      ],
    },
  });

  if (existing) {
    if (existing.authSubject !== authUser.id || existing.email !== normalizedEmail) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          authSubject: authUser.id,
          email:       normalizedEmail,
        },
      });
    }
    return existing;
  }

  const meta = authUser.user_metadata as Record<string, unknown> | undefined;
  const nameFromMeta =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : null;

  return prisma.user.create({
    data: {
      email:       normalizedEmail,
      authSubject: authUser.id,
      role:        "OPERATOR",
      name:        nameFromMeta,
    },
  });
}
