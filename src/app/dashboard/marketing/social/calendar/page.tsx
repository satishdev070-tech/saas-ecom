import type { Metadata } from "next";
import { addDays, eachDay, isDateKey, istDateKey, istDayStart } from "@/features/analytics/dates";
import { getCalendar } from "@/features/social/server/planner";
import { PlannerCalendar } from "@/features/social/components/calendar";
import { PlanNotice, loadSocialBase } from "../_lib/data";

export const metadata: Metadata = { title: "Social calendar" };

const BASE = "/dashboard/marketing/social/calendar";
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (k: string, f: Intl.DateTimeFormat) => f.format(Date.parse(`${k}T00:00:00Z`));
/** Monday of the week containing the date key. */
const monday = (k: string) => addDays(k, -((new Date(`${k}T00:00:00Z`).getUTCDay() + 6) % 7));
const monthStart = (k: string) => `${k.slice(0, 7)}-01`;
const shiftMonth = (k: string, n: number) => {
  const d = new Date(`${monthStart(k)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export default async function SocialCalendarPage({ searchParams }: PageProps<"/dashboard/marketing/social/calendar">) {
  const { ctx, enabled, write } = await loadSocialBase();
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const today = istDateKey(new Date());
  const anchor = isDateKey(sp.date) ? sp.date : today;

  let days: string[];
  let title: string;
  let prev: string;
  let next: string;
  if (view === "month") {
    const first = monthStart(anchor);
    const last = addDays(shiftMonth(anchor, 1), -1);
    days = eachDay(monday(first), addDays(monday(last), 6));
    title = fmt(first, monthFmt);
    prev = shiftMonth(anchor, -1);
    next = shiftMonth(anchor, 1);
  } else {
    const start = monday(anchor);
    days = eachDay(start, addDays(start, 6));
    title = `${fmt(start, shortFmt)} – ${fmt(addDays(start, 6), shortFmt)}`;
    prev = addDays(start, -7);
    next = addDays(start, 7);
  }
  const href = (v: string, d: string) => `${BASE}?view=${v}&date=${d}`;
  const data = await getCalendar(ctx.tenantId, istDayStart(days[0]!).toISOString(), istDayStart(addDays(days.at(-1)!, 1)).toISOString());

  return (
    <div className="space-y-4">
      <PlanNotice enabled={enabled} />
      <PlannerCalendar
        key={`${view}-${days[0]}`}
        view={view}
        title={title}
        days={days}
        month={view === "month" ? anchor.slice(0, 7) : null}
        today={today}
        nav={{ prev: href(view, prev), next: href(view, next), today: href(view, today), month: href("month", anchor), week: href("week", anchor) }}
        posts={data.posts}
        undated={data.undated}
        campaigns={data.campaigns}
        dates={data.dates}
        canWrite={write}
      />
    </div>
  );
}
