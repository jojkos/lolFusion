import type { Metadata } from "next";
import { Cinzel, EB_Garamond, JetBrains_Mono } from "next/font/google";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  display: "swap",
});

const ebGaramond = EB_Garamond({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://lol-fusion.vercel.app'),
  title: "LoL Fusion | Daily Champion Puzzle",
  description: "Daily League of Legends fusion puzzle. Guess the two combined champions and the skin theme.",
  keywords: ["League of Legends", "Puzzle", "Daily Game", "Fusion", "LoLle", "Wordle"],
  openGraph: {
    title: "LoL Fusion | Daily Champion Puzzle",
    description: "Can you identify the fused League of Legends champions? Guess the daily combination!",
    url: "https://lol-fusion.vercel.app",
    siteName: "LoL Fusion",
    images: [
      {
        url: "/example.png",
        width: 1200,
        height: 630,
        alt: "LoL Fusion Daily Puzzle",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LoL Fusion | Daily Champion Puzzle",
    description: "Can you identify the fused League of Legends champions?",
    images: ["/example.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: { url: "/favicon-180.png", sizes: "180x180", type: "image/png" },
  },
};

import BuyMeCoffee from "@/components/BuyMeCoffee";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${cinzel.variable} ${ebGaramond.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <Analytics />
        <BuyMeCoffee />
      </body>
    </html>
  );
}
