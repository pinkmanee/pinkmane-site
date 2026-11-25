import type { Metadata, Viewport } from "next";
import PhoneFix from "./components/PhoneFix";
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

// PHONES: the page is exactly as wide as the screen and can't be pinch-zoomed (zooming in on a game left you stuck,
// especially in the Home Screen app, where there is no way to zoom back out). "cover" = use the whole screen, under the notch too.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#d63cc8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PhoneFix />
        {children}
      </body>
    </html>
  );
}
