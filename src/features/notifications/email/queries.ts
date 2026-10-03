import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbError } from "@/lib/supabase/errors";
import { resolveEmailPreferences, type EmailPreferences } from "./preferences";

/** Email toggles for a dashboard page (user session; RLS: store.read on the tenant). */
export async function getEmailPreferences(tenantId: string): Promise<EmailPreferences> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("email_preferences").select("settings").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw mapDbError(error);
  return resolveEmailPreferences(data?.settings);
}

/** Last 20 email attempts for the active store (RLS: settings.write). Masked recipients only. */
export async function listRecentEmails(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_log")
    .select("id, kind, recipient_masked, status, error, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw mapDbError(error);
  return data ?? [];
}
