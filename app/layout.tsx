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
    "PINKMANE is a cloud rap and trap artist. Stream on Spotify, Apple Music and SoundCloud, shop merch, and find all socials.",
  keywords: [
    "PINKMANE",
    "PINKMANE music",
    "PINKMANE artist",
    "PINKMANE soundcloud",
    "PINKMANE cloud rap",
    "PINKMANE trap",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PINKMANE",
    description: "Cloud rap and trap from PINKMANE. Music, releases, merch and socials.",
    url: "https://pinkmane.site",
    siteName: "PINKMANE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PINKMANE",
    description: "Cloud rap and trap from PINKMANE. Music, releases, merch and socials.",
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
