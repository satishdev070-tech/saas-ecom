import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/layout";
import { loadIntegration } from "@/features/integrations/server/store";
import { networkConfigured, pinterestBoards } from "@/features/social/server/providers";
import { SocialAccounts } from "@/features/social/components/social-ui";
import { ChannelChip } from "@/features/social/components/channels";
import { CHANNEL_LABELS, MANUAL_CHANNELS } from "@/features/social/compose";
import { getPlatformContext } from "@/lib/platform/access";
import { OAuthBanners, PlanNotice, loadSocialBase } from "../_lib/data";

export const metadata: Metadata = { title: "Social accounts" };

const MANUAL_NOTE: Record<(typeof MANUAL_CHANNELS)[number], string> = {
  whatsapp: "Status updates and broadcast lists.",
  x: "Posts on your X profile.",
  linkedin: "Your page or profile feed.",
  threads: "Posts on Threads.",
  youtube: "Shorts and community posts. Connecting above only shows your channel.",
};

export default async function SocialAccountsPage({ searchParams }: PageProps<"/dashboard/marketing/social/accounts">) {
  const { ctx, summaries, enabled, write } = await loadSocialBase();
  const sp = await searchParams;
  let boards: { id: string; name: string }[] = [];
  const pin = summaries.find((s) => s.provider === "pinterest");
  if (write && pin?.status === "connected") {
    const it = await loadIntegration(ctx.tenantId, "pinterest");
    const r = it?.secrets.access_token ? await pinterestBoards(it.secrets.access_token) : null;
    boards = r?.ok ? r.data : [];
  }
  const [meta, pinterest, youtube, platform] = await Promise.all([networkConfigured("meta"), networkConfigured("pinterest"), networkConfigured("youtube"), getPlatformContext()]);
  const configured = { meta, pinterest, youtube };
  const missing = (Object.keys(configured) as (keyof typeof configured)[]).filter((n) => !configured[n]);
  const isPlatformAdmin = Boolean(platform?.permissions.has("platform.settings.manage"));

  return (
    <div className="space-y-6">
      <OAuthBanners sp={sp} />
      <PlanNotice enabled={enabled} />
      {missing.length ? <SetupNote missing={missing} isPlatformAdmin={isPlatformAdmin} /> : null}
      <div>
        <h2 className="mb-1 text-h3">Auto-publish</h2>
        <p className="mb-3 text-small text-muted">Connected networks publish your scheduled posts automatically.</p>
        <SocialAccounts
          canManage={write}
          configured={configured}
          boards={boards}
          accounts={summaries.map((s) => ({ provider: s.provider, status: s.status, enabled: s.enabled, account: s.public.account_name ?? null, board: s.public.board_id ?? null, boardName: s.public.board_name ?? null, message: s.statusMessage, connectedAt: s.connectedAt }))}
        />
      </div>
      <div>
        <h2 className="mb-1 text-h3">Messaging and local</h2>
        <p className="mb-3 text-small text-muted">Connected from their own pages.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          <LinkCard href="/dashboard/marketing/inbox" title="WhatsApp Business" body="Reply to WhatsApp, Messenger and Instagram messages from one inbox. Connect your WhatsApp Business number there." ready={meta} network="Meta" isPlatformAdmin={isPlatformAdmin} />
          <LinkCard href="/dashboard/marketing/google" title="Google Business Profile" body="Post updates to your Google listing and reply to reviews." ready={youtube} network="Google" isPlatformAdmin={isPlatformAdmin} />
        </ul>
      </div>
      <Card title="Planned posting: we remind you, you post" description="These networks don't offer posting access to apps like ours. Add them to a post and it shows on your calendar; when it's due we give you the caption and image to post yourself, then you mark it posted.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MANUAL_CHANNELS.map((c) => (
            <li key={c} className="flex items-start gap-2.5 rounded-md border border-border p-3">
              <ChannelChip channel={c} className="mt-0.5 h-5 min-w-5 text-[11px]" />
              <div>
                <p className="text-small font-medium">{CHANNEL_LABELS[c]}</p>
                <p className="text-caption text-muted">{MANUAL_NOTE[c]}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const NETWORK_NAMES = { meta: "Meta (Facebook & Instagram)", pinterest: "Pinterest", youtube: "Google (YouTube)" } as const;
const ADMIN_PATH = "/admin/social-apps";

function AdminNote({ network, isPlatformAdmin }: { network: string; isPlatformAdmin: boolean }) {
  return (
    <>
      Your platform admin needs to add the {network} app in Admin → Social apps.
      {isPlatformAdmin ? (
        <>
          {" "}
          <Link href={ADMIN_PATH} className="font-medium text-accent hover:underline">
            Set it up now →
          </Link>
        </>
      ) : null}
    </>
  );
}

/** Replaces a bare "Not configured" with who needs to act and where (no fake connect buttons). */
function SetupNote({ missing, isPlatformAdmin }: { missing: (keyof typeof NETWORK_NAMES)[]; isPlatformAdmin: boolean }) {
  return (
    <div role="note" className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-small">
      <p className="font-medium">Some networks can&apos;t be connected yet</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {missing.map((n) => (
          <li key={n}>
            <AdminNote network={NETWORK_NAMES[n]} isPlatformAdmin={isPlatformAdmin} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkCard({ href, title, body, ready, network, isPlatformAdmin }: { href: string; title: string; body: string; ready: boolean; network: string; isPlatformAdmin: boolean }) {
  return (
    <li className="rounded-md border border-border p-3">
      <p className="text-small font-medium">{title}</p>
      <p className="text-caption text-muted">{body}</p>
      {ready ? (
        <Link href={href} className="mt-2 inline-block text-small font-medium text-accent hover:underline">
          Open {title} →
        </Link>
      ) : (
        <p className="mt-2 text-caption text-muted">
          <AdminNote network={network} isPlatformAdmin={isPlatformAdmin} />
        </p>
      )}
    </li>
  );
}
