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
  title: "LoL Fusion | Daily Champion Puzzle",
  description: "Daily League of Legends fusion puzzle. Guess the two combined champions and the skin theme.",
  keywords: ["League of Legends", "Puzzle", "Daily Game", "Fusion", "LoLle", "Wordle"],
  openGraph: {
    title: "LoL Fusion",
    description: "Can you identify the fused League of Legends champions?",
    type: "website",
  },
  icons: {
    icon: "/favicon.png",
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
        <BuyMeCoffee />
      </body>
    </html>
  );
}
