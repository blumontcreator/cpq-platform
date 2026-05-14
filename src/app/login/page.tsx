import { redirect } from "next/navigation";
import { getConsoleOperatorContext } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/navigation/safe-next-path";

export const metadata = { title: "Sign in — CPQ Console" };

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const ctx = await getConsoleOperatorContext();
  if (ctx) {
    if (
      ctx.organizationId &&
      ctx.organizationSlug &&
      ctx.organizationRole !== undefined
    ) {
      redirect("/catalog");
    }
    redirect("/setup");
  }

  const params = await searchParams;
  return (
    <LoginForm
      nextPath={safeNextPath(params.next, "/catalog")}
      errorCode={params.error}
    />
  );
}
