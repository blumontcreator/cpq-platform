import { redirect } from "next/navigation";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { getCurrentOrganization } from "@/lib/tenant";

export const metadata = { title: "Organization setup — CPQ Console" };

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requireConsoleAuth();
  const org = await getCurrentOrganization();
  if (org) {
    redirect("/catalog");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16 text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">Organization access</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        Your account is signed in, but you are not a member of any organization yet.
        Contact your administrator to be invited, or run the demo seed to create the
        demo organization and memberships.
      </p>
    </div>
  );
}
