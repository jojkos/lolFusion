import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from '@vercel/analytics/next';
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
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
        <BuyMeCoffee />
      </body>
    </html>
  );
}
