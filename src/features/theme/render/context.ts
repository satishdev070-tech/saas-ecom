import type { Storefront } from "@/features/storefront/server/context";
import type { MenuNode } from "@/features/storefront/urls";

/** Everything a section renderer may need, resolved once per request by the store layout/page. */
export type RenderContext = {
  sf: Storefront;
  menus: Record<string, { title: string; items: MenuNode[] }>;
  cartCount: number;
  signedIn: boolean;
};
