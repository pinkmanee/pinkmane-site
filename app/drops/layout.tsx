// pinkmane.site/drops is YOUR private page (the drop alert email list). Google is told to leave it alone.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DROP LIST · PINKMANE",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
