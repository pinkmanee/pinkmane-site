// The browser tab and Google title for pinkmane.site/merch
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MERCH · PINKMANE",
  description: "Official PINKMANE merch: shirts and more, straight from the artist.",
  alternates: { canonical: "/shop" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
