import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/forms";
import { signOutAction } from "@/features/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { getPlatformContext } from "@/lib/platform/access";
import { safeRedirectPath } from "@/lib/http/safe-redirect";
import { LockKeyhole } from "lucide-react";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { ConsoleAside } from "@/components/auth/auth-asides";

export const metadata: Metadata = { title: "Platform console sign in", robots: { index: false, follow: false } };

/**
 * Platform staff sign-in. Access is decided server-side by an active platform_memberships row
 * (RLS-protected), never by which login page was used.
 */
export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const requested = typeof sp.next === "string" ? safeRedirectPath(sp.next, "/admin") : "/admin";
  const next = requested === "/admin" || requested.startsWith("/admin/") ? requested : "/admin";
  const user = await getSessionUser();
  if (user && (await getPlatformContext())) redirect(next);

  return (
    <AuthSplit variant="console" aside={<ConsoleAside />}>
      {user ? (
        <div role="alert" className="space-y-4">
          <AuthHeading eyebrow="Platform console" title="No console access" description={`${user.email ?? "This account"} isn't a platform staff account. Sign in with a staff account to continue.`} />
          <form action={signOutAction}>
            <input type="hidden" name="to" value="admin" />
            <button type="submit" className="w-full rounded-md border border-border px-3 py-2 text-small font-medium hover:bg-surface-secondary">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <>
          <AuthHeading eyebrow="Platform console" title="Staff sign in" description="Restricted to platform staff accounts." />
          {sp.error ? (
            <p role="alert" className="mb-5 rounded-md border border-error/25 bg-error/10 px-3 py-2 text-small text-error">
              That sign-in link is invalid or has expired.
            </p>
          ) : null}
          <SignInForm next={next} variant="admin" />
          <p className="mt-8 flex items-start gap-2 text-caption text-subtle">
            <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Merchants sign in at the seller centre. This page is for platform administrators only.
          </p>
        </>
      )}
    </AuthSplit>
  );
}
