"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { assetUrl } from "@/lib/storage/assets";
import type { MenuNode } from "@/features/storefront/urls";
import { BagIcon, ChevronIcon, ClockIcon, CloseIcon, HeartIcon, HomeIcon, MenuIcon, OrdersIcon, SearchIcon, UserIcon } from "./icons";

/** Event the add-to-bag forms dispatch so the header opens the cart drawer. */
export const CART_OPEN_EVENT = "sf:cart-open";

/**
 * Native <dialog> as a modal drawer/overlay: the browser provides focus trapping, Escape to
 * close and inert background. Closes on backdrop click and on route change.
 */
function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const open = useCallback(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      document.documentElement.classList.add("sf-scroll-lock");
    }
  }, []);
  const close = useCallback(() => ref.current?.close(), []);
  useEffect(() => {
    close();
  }, [pathname, close]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => document.documentElement.classList.remove("sf-scroll-lock");
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("close", onClose);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("close", onClose);
      d.removeEventListener("click", onClick);
    };
  }, []);
  return { ref, open, close };
}

// ------------------------------------------------------------------ search

type Suggestions = {
  query: string;
  total: number;
  products: { slug: string; title: string; imagePath: string | null; priceMinor: number; compareAtMinor: number | null; inStock: boolean }[];
  categories: { slug: string; name: string }[];
  collections: { slug: string; title: string }[];
};

const RECENT_KEY = "sf-recent-searches";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
function rememberSearch(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}

/** Header search: overlay with live suggestions from /search/suggest (real catalog data). */
export function SearchOverlay({ popular }: { popular: { label: string; href: string }[] }) {
  const { ref, open, close } = useDialog();
  const router = useRouter();
  const inputId = useId();
  const [q, setQ] = useState("");
  const [data, setData] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const term = q.trim();
    // Short queries show recent/popular instead; stale results are simply not rendered.
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) setData((await res.json()) as Suggestions);
      } catch {
        /* aborted or offline: keep the last results */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const submit = (term: string) => {
    const t = term.trim();
    if (!t) return;
    rememberSearch(t);
    close();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const hasResults = data && (data.products.length || data.categories.length || data.collections.length);
  return (
    <>
      <button
        type="button"
        className="sf-icon-btn"
        aria-label="Search"
        onClick={() => {
          setRecent(readRecent());
          open();
        }}
      >
        <SearchIcon />
      </button>
      <dialog ref={ref} aria-label="Search" className="sf-dialog sf-dialog-top">
        <div className="sf-container py-5">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit(q);
            }}
            className="flex items-center gap-3 border-b border-[var(--sf-text)] pb-3"
          >
            <SearchIcon size={22} />
            <label htmlFor={inputId} className="sr-only">
              Search products
            </label>
            <input
              id={inputId}
              type="search"
              autoFocus
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search kurtas, sarees, prints…"
              className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[var(--sf-muted)]"
            />
            <button type="button" onClick={close} className="sf-icon-btn" aria-label="Close search">
              <CloseIcon />
            </button>
          </form>

          <div className="max-h-[70dvh] overflow-y-auto pt-5" aria-live="polite" aria-busy={loading}>
            {q.trim().length < 2 ? (
              <div className="grid gap-8 @[48rem]:grid-cols-2">
                {recent.length ? (
                  <section>
                    <h2 className="sf-eyebrow mb-3">Recent searches</h2>
                    <ul className="space-y-2">
                      {recent.map((r) => (
                        <li key={r}>
                          <button type="button" onClick={() => submit(r)} className="sf-link-quiet flex items-center gap-2 text-sm">
                            <ClockIcon size={16} /> {r}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {popular.length ? (
                  <section>
                    <h2 className="sf-eyebrow mb-3">Popular</h2>
                    <ul className="flex flex-wrap gap-2">
                      {popular.map((p) => (
                        <li key={p.href}>
                          <Link href={p.href} className="sf-chip">
                            {p.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : hasResults ? (
              <div className="grid gap-8 @[48rem]:grid-cols-[1fr_220px]">
                <section>
                  <h2 className="sf-eyebrow mb-3">Products</h2>
                  {data.products.length ? (
                    <ul className="grid gap-3 @[40rem]:grid-cols-2">
                      {data.products.map((p) => {
                        const src = assetUrl(p.imagePath);
                        return (
                          <li key={p.slug}>
                            <Link href={`/products/${encodeURIComponent(p.slug)}`} className="group flex items-center gap-3">
                              <span className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[var(--sf-radius-card)] bg-[var(--sf-border)]">
                                {src ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- tiny thumbnails in a client overlay
                                  <img src={src} alt="" className="size-full object-cover" loading="lazy" />
                                ) : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm group-hover:underline">{p.title}</span>
                                <span className="text-sm tabular-nums">
                                  {formatMoney(p.priceMinor)}
                                  {p.compareAtMinor && p.compareAtMinor > p.priceMinor ? <s className="sf-muted ml-2 text-xs">{formatMoney(p.compareAtMinor)}</s> : null}
                                </span>
                                {!p.inStock ? <span className="sf-muted block text-xs">Sold out</span> : null}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="sf-muted text-sm">No products match, try a category instead.</p>
                  )}
                  {data.total > data.products.length ? (
                    <button type="button" onClick={() => submit(q)} className="sf-link mt-4 text-sm">
                      See all {data.total} results
                    </button>
                  ) : null}
                </section>
                {data.categories.length || data.collections.length ? (
                  <section className="space-y-3">
                    <h2 className="sf-eyebrow">Categories & collections</h2>
                    <ul className="space-y-2 text-sm">
                      {data.categories.map((c) => (
                        <li key={`c-${c.slug}`}>
                          <Link href={`/categories/${encodeURIComponent(c.slug)}`} className="sf-link-quiet">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                      {data.collections.map((c) => (
                        <li key={`k-${c.slug}`}>
                          <Link href={`/collections/${encodeURIComponent(c.slug)}`} className="sf-link-quiet">
                            {c.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : data ? (
              <div className="space-y-4 py-4">
                <p className="text-sm">
                  No results for <strong>“{data.query}”</strong>. Check the spelling or browse:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {popular.map((p) => (
                    <li key={p.href}>
                      <Link href={p.href} className="sf-chip">
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="sf-muted text-sm">Searching…</p>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

// ------------------------------------------------------------------ mobile navigation

export function MobileNav({ items, storeName, signedIn, alwaysVisible = false }: { items: MenuNode[]; storeName: string; signedIn: boolean; alwaysVisible?: boolean }) {
  const { ref, open, close } = useDialog();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={`sf-icon-btn ${alwaysVisible ? "" : "@[64rem]:hidden"}`} aria-label="Open menu" onClick={open}>
        <MenuIcon />
      </button>
      <dialog ref={ref} aria-label="Menu" className="sf-dialog sf-dialog-left">
        <div className="flex h-full flex-col">
          <div className="sf-border flex items-center justify-between border-b px-5 py-4">
            <span className="sf-heading text-lg">{storeName}</span>
            <button type="button" onClick={close} className="sf-icon-btn" aria-label="Close menu">
              <CloseIcon />
            </button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-3">
            <ul className="divide-y divide-[var(--sf-border)]">
              {items.map((n) => (
                <li key={n.id}>
                  {n.children.length ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={expanded === n.id}
                        onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                        className={`flex w-full items-center justify-between py-3.5 text-left text-[15px] ${n.highlight ? "text-[var(--sf-sale)]" : ""}`}
                      >
                        {n.title}
                        <ChevronIcon size={18} className={`transition-transform ${expanded === n.id ? "rotate-90" : ""}`} />
                      </button>
                      {expanded === n.id ? (
                        <ul className="space-y-3 pb-4 pl-3 text-sm">
                          {n.href ? (
                            <li>
                              <Link href={n.href} className="font-medium">
                                Shop all {n.title}
                              </Link>
                            </li>
                          ) : null}
                          {n.children.map((c) => (
                            <li key={c.id}>
                              {c.href ? (
                                <Link href={c.href} className="sf-link-quiet">
                                  {c.title}
                                </Link>
                              ) : (
                                <span>{c.title}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : n.href ? (
                    <Link href={n.href} className={`block py-3.5 text-[15px] ${n.highlight ? "text-[var(--sf-sale)]" : ""}`}>
                      {n.title}
                    </Link>
                  ) : (
                    <span className="block py-3.5">{n.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="sf-border space-y-3 border-t px-5 py-4 text-sm">
            <Link href="/account" className="block">
              {signedIn ? "My account" : "Sign in / Register"}
            </Link>
            <Link href="/account/wishlist" className="block">
              Wishlist
            </Link>
            <Link href="/account/orders" className="block">
              Track order
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

// ------------------------------------------------------------------ cart drawer

/** Bag button + slide-over. `children` is the server-rendered cart summary (fresh after refresh()). */
export function CartDrawer({ count, children, inlineCount = false }: { count: number; children: ReactNode; inlineCount?: boolean }) {
  const { ref, open, close } = useDialog();
  useEffect(() => {
    const onOpen = () => open();
    window.addEventListener(CART_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CART_OPEN_EVENT, onOpen);
  }, [open]);
  return (
    <>
      <button type="button" className={inlineCount ? "sf-icon-btn sf-bag-inline" : "sf-icon-btn relative"} aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`} onClick={open}>
        <BagIcon />
        {inlineCount ? (
          <span aria-hidden className="sf-bag-count">
            {count}
          </span>
        ) : count > 0 ? (
          <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--sf-primary)] px-1 text-[10px] leading-4 text-[var(--sf-primary-fg)]">
            {count}
          </span>
        ) : null}
      </button>
      <dialog ref={ref} aria-label="Your bag" className="sf-dialog sf-dialog-right">
        <div className="flex h-full flex-col">
          <div className="sf-border flex items-center justify-between border-b px-5 py-4">
            <p className="sf-heading text-lg">
              Your bag <span className="sf-muted text-sm">({count})</span>
            </p>
            <button type="button" onClick={close} className="sf-icon-btn" aria-label="Close bag">
              <CloseIcon />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** Opens the cart drawer; used by add-to-bag forms after a successful add. */
export function openCartDrawer() {
  window.dispatchEvent(new Event(CART_OPEN_EVENT));
}

/** Marks <html data-sf-scrolled> once the page scrolls, so the sticky header can gain a shadow. */
export function HeaderScrollState() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.toggleAttribute("data-sf-scrolled", window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      root.removeAttribute("data-sf-scrolled");
    };
  }, []);
  return null;
}

// ------------------------------------------------------------------ mobile bottom nav

/**
 * App-style bottom navigation for phones (opt-in: header setting `bottomNav`). Fixed, safe-area
 * aware, hidden from 768px up (CSS). The page gets matching bottom padding via CSS (:has()).
 */
export function BottomNav({ cartCount, signedIn }: { cartCount: number; signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const items = [
    { href: "/", label: "Home", icon: <HomeIcon size={22} />, active: pathname === "/" },
    { href: "/search", label: "Search", icon: <SearchIcon size={22} />, active: pathname.startsWith("/search") },
    { href: "/account/wishlist", label: "Wishlist", icon: <HeartIcon size={22} />, active: pathname.startsWith("/account/wishlist") },
    { href: "/cart", label: "Bag", icon: <BagIcon size={22} />, active: pathname.startsWith("/cart"), badge: cartCount },
    { href: "/account", label: signedIn ? "Account" : "Sign in", icon: <UserIcon size={22} />, active: pathname === "/account" || (pathname.startsWith("/account") && !/^\/account\/(wishlist|orders)/.test(pathname)) },
    { href: "/account/orders", label: "Orders", icon: <OrdersIcon size={22} />, active: pathname.startsWith("/account/orders") },
  ];
  return (
    <nav aria-label="Quick links" className="sf-bottomnav">
      <ul>
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className={`sf-bottomnav-link ${it.active ? "is-active" : ""}`}
              aria-current={it.active ? "page" : undefined}
              aria-label={it.badge ? `${it.label}, ${it.badge} ${it.badge === 1 ? "item" : "items"}` : undefined}
            >
              <span className="relative">
                {it.icon}
                {it.badge ? (
                  <span aria-hidden className="sf-bottomnav-badge">
                    {it.badge > 99 ? "99+" : it.badge}
                  </span>
                ) : null}
              </span>
              <span className="sf-bottomnav-label">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
