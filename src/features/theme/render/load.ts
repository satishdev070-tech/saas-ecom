import "server-only";
import { cache } from "react";
import { requireStorefront } from "@/features/storefront/server/context";
import { getMenus } from "@/features/storefront/server/content";
import { getCartCount } from "@/features/cart/queries";
import { getStoreCustomer } from "@/features/customer-account/session";
import type { ThemeConfig } from "@/features/theme/schema/config";
import type { RenderContext } from "./context";

/** Menu handles referenced anywhere in the theme (header setting, MegaMenu, Footer). */
export function menuHandles(theme: ThemeConfig): string[] {
  const set = new Set<string>([theme.header.menuHandle]);
  for (const s of [...theme.layout.header, ...theme.layout.footer]) {
    const st = s.settings as { menuHandle?: unknown; menuHandles?: unknown };
    if (typeof st.menuHandle === "string") set.add(st.menuHandle);
    if (Array.isArray(st.menuHandles)) for (const h of st.menuHandles) if (typeof h === "string") set.add(h);
  }
  return [...set].filter(Boolean).sort();
}

/** Per-request storefront render context shared by the store layout and pages (memoised). */
export const getRenderContext = cache(async (host: string): Promise<RenderContext> => {
  const sf = await requireStorefront(host);
  const [menus, cartCount, customer] = await Promise.all([
    getMenus(sf.tenant.tenantId, menuHandles(sf.theme).join(",")),
    getCartCount(sf.tenant.tenantId),
    getStoreCustomer(sf.tenant.tenantId),
  ]);
  return { sf, menus, cartCount, signedIn: Boolean(customer) };
});
