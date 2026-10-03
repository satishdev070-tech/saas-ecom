import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateStoreForm } from "@/features/tenants/forms";
import { AuthHeading, AuthSplit } from "@/components/auth/auth-split";
import { MerchantAside } from "@/components/auth/auth-asides";

export const metadata: Metadata = { title: "Create your store", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireUser("/onboarding");
  const sp = await searchParams;
  // Prefill from the sign-up form (query or the account's metadata after email confirmation).
  const { data } = await (await createSupabaseServerClient()).auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { store_name?: unknown };
  const fromQuery = typeof sp.name === "string" ? sp.name : "";
  const defaultName = (fromQuery || (typeof meta.store_name === "string" ? meta.store_name : "")).slice(0, 120);
  return (
    <AuthSplit variant="merchant" aside={<MerchantAside mode="register" />}>
      <AuthHeading eyebrow="Step 2 of 2" title="Name your store" description="You get a 14-day free trial. No card needed." />
      <CreateStoreForm rootDomain={publicEnv().NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN} defaultName={defaultName} />
    </AuthSplit>
  );
}
