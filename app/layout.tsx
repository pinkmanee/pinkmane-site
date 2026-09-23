import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pinkmane.site"),
  title: "PINKMANE",
  description:
    "PINKMANE is an independent music artist. Listen to music and new releases, shop merch, and find all socials.",
  keywords: ["PINKMANE", "PINKMANE music", "PINKMANE artist", "PINKMANE soundcloud"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PINKMANE",
    description: "Music, releases, merch and socials from PINKMANE.",
    url: "https://pinkmane.site",
    siteName: "PINKMANE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PINKMANE",
    description: "Music, releases, merch and socials from PINKMANE.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
