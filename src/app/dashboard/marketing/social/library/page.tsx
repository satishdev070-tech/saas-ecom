import type { Metadata } from "next";
import { Card } from "@/components/ui/layout";
import { addDays, istDateKey } from "@/features/analytics/dates";
import { listCampaigns, listHashtagSets, listMarketingDates } from "@/features/social/server/planner";
import { builtInDatesBetween } from "@/features/social/planner";
import { CampaignsManager, HashtagSetsManager, MarketingDatesManager } from "@/features/social/components/library";
import { PlanNotice, loadSocialBase } from "../_lib/data";

export const metadata: Metadata = { title: "Social library" };

export default async function SocialLibraryPage() {
  const { ctx, enabled, write } = await loadSocialBase();
  const today = istDateKey(new Date());
  const [campaigns, sets, own] = await Promise.all([listCampaigns(ctx.tenantId), listHashtagSets(ctx.tenantId), listMarketingDates(ctx.tenantId, addDays(today, -30))]);
  const builtIn = builtInDatesBetween(today, addDays(today, 365));
  return (
    <div className="space-y-6">
      <PlanNotice enabled={enabled} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Campaigns" description="Colour-code related posts on the calendar.">
          <CampaignsManager campaigns={campaigns} canWrite={write} />
        </Card>
        <Card title="Hashtag sets" description="Reusable groups you can insert while writing.">
          <HashtagSetsManager sets={sets} canWrite={write} />
        </Card>
      </div>
      <Card title="Key dates" description="Store dates and festive occasions shown on the calendar.">
        <MarketingDatesManager dates={[...own, ...builtIn]} canWrite={write} />
      </Card>
    </div>
  );
}
