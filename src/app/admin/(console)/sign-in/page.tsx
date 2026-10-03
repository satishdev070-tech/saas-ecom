import type { Metadata } from "next";
import { requirePlatform } from "@/lib/platform/access";
import { publicEnv } from "@/lib/env/public";
import { platformOrigin } from "@/lib/platform/urls";
import { googleAuthEnabled } from "@/features/auth/google";
import { listPlatformSettings } from "@/features/platform/server/queries";
import { SettingCards } from "@/features/platform/components/setting-cards";
import { PUBLIC_CONFIG_KEYS } from "@/features/platform/public-config";
import { Badge, Card, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Sign-in & checkout" };

function Copy({ label, value }: { label: string; value: string }) {
  return (
    <li>
      <p className="text-caption text-muted">{label}</p>
      <code className="block break-all rounded-md border border-border bg-surface-secondary px-2 py-1 text-caption">{value}</code>
    </li>
  );
}

/** Social sign-in for sellers and store customers, guest checkout and location autofill. */
export default async function SignInMethodsPage() {
  await requirePlatform("platform.settings.manage");
  const [google, stored] = await Promise.all([googleAuthEnabled(), listPlatformSettings()]);
  const env = publicEnv();
  const supabaseCallback = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/callback`;
  const root = env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN;
  return (
    <div className="space-y-4">
      <PageHeader title="Sign-in & checkout" description="How sellers and shoppers sign in, and checkout conveniences offered on every store. Changes are audited." />

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            Google sign-in {google ? <Badge tone="success">Provider enabled in Supabase</Badge> : <Badge tone="warning">Provider not enabled in Supabase</Badge>}
          </span>
        }
        description="“Continue with Google” appears for sellers (sign-in and sign-up) and for customers on every store, once the Google provider is enabled in Supabase Auth. Use the switches below to hide it for either audience."
        actions={
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-small text-accent hover:underline">
            Google Cloud credentials ↗
          </a>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ol className="list-decimal space-y-2 pl-5 text-small">
            <li>Google Cloud Console → APIs &amp; Services → Credentials → Create OAuth client ID (Web application). Add the Supabase callback below as an authorised redirect URI.</li>
            <li>Configure the OAuth consent screen (app name, support email, logo, privacy policy) and publish it when you go live.</li>
            <li>Supabase → Authentication → Sign In / Providers → Google: enable it and paste the client ID and secret.</li>
            <li>Supabase → Authentication → URL Configuration → Redirect URLs: add the URLs below, plus each custom store domain (e.g. https://thepaliya.com/**).</li>
            <li>Reload this page: the badge turns green and the buttons appear within 5 minutes, no deploy needed.</li>
          </ol>
          <ul className="space-y-2">
            <Copy label="Authorised redirect URI (Google Cloud)" value={supabaseCallback} />
            <Copy label="Redirect URL: platform (sellers)" value={`${platformOrigin()}/**`} />
            {root !== "localhost" ? <Copy label="Redirect URL: store subdomains (shoppers)" value={`https://*.${root}/**`} /> : null}
          </ul>
        </div>
      </Card>

      <SettingCards keys={[PUBLIC_CONFIG_KEYS.googleSellers, PUBLIC_CONFIG_KEYS.googleShoppers, PUBLIC_CONFIG_KEYS.locationAutofill]} stored={stored} />

      <Card title="Guest checkout" description="Each store decides whether shoppers can check out without an account (on by default). Store owners change it in Dashboard → Settings → Checkout. Guests still get order emails and a customer record for the seller; only signed-in customers can see their order history.">
        <p className="text-small text-muted">Location autofill uses the browser&apos;s location permission and OpenStreetMap Nominatim reverse geocoding (© OpenStreetMap contributors). Coordinates are sent once to fill the form and are never stored.</p>
      </Card>
    </div>
  );
}
