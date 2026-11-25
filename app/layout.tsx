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
  // what Google shows under the link (keep it under ~160 characters)
  description:
    "PINKMANE is an independent artist, producer and coder who makes his own games. Play PINKMANE VOID, his main game, listen to the music and shop merch.",
  keywords: [
    "PINKMANE",
    "PINKMANE music",
    "PINKMANE artist",
    "PINKMANE soundcloud",
    "PINKMANE cloud rap",
    "PINKMANE trap",
    "PINKMANE VOID",
    "PINKMANE games",
    "PINKMANE producer",
    "independent artist",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PINKMANE",
    description: "PINKMANE is an independent artist, producer and coder who makes his own games. Play PINKMANE VOID, his main game, listen to the music and shop merch.",
    url: "https://pinkmane.site",
    siteName: "PINKMANE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PINKMANE",
    description: "PINKMANE is an independent artist, producer and coder who makes his own games. Play PINKMANE VOID, his main game, listen to the music and shop merch.",
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
