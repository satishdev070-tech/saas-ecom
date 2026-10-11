import type { Metadata } from "next";
import "./print.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Bare layout for printable order documents (no dashboard chrome). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="print-root w-full">
      {children}
    </div>
  );
}
