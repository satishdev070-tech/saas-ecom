import { PageHeader } from "@/components/ui/layout";
import { SocialTabs } from "@/features/social/components/social-tabs";

export default function SocialLayout({ children }: LayoutProps<"/dashboard/marketing/social">) {
  return (
    <div>
      <PageHeader title="Social" description="Plan, schedule and publish your store's social posts in one calendar." />
      <SocialTabs />
      {children}
    </div>
  );
}
