import type { Metadata } from "next";
import { platformIconMetadata } from "@/features/platform/server/public-config";

export function generateMetadata(): Promise<Metadata> {
  return platformIconMetadata();
}

/** Auth pages render their own split layout (components/auth/auth-split). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
