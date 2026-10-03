import type { Metadata, Viewport } from "next";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/config/platform";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance";
import { fraunces, inter } from "./fonts";
import { storefrontFontVariables } from "./storefront-fonts";
import "./globals.css";

/**
 * Root layout shared by platform pages and storefronts. Storefront layouts override
 * metadata per tenant (generateMetadata) and inject theme tokens; nothing tenant-specific
 * belongs here.
 */
export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
  description: PLATFORM_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by the boot script (saved preference); React must not fight it.
    <html lang="en-IN" className={`${inter.variable} ${fraunces.variable} ${storefrontFontVariables} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Static, first-party script (no user input): applies the saved light/dark preference. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
