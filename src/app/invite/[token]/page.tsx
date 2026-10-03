import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { AcceptInviteForm } from "@/features/tenants/forms";

export const metadata: Metadata = { title: "Join a store", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await requireUser(`/invite/${encodeURIComponent(token)}`);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold">You&apos;ve been invited</h1>
        <p className="mb-5 text-sm text-muted">Accept to join the store team as {user.email}.</p>
        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}
