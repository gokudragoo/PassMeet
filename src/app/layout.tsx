import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AleoWalletProvider } from "@/components/AleoWalletProvider";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NetworkBanner } from "@/components/NetworkBanner";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://passmeet.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PassMeet | Private Event Access on Aleo",
    template: "%s | PassMeet",
  },
  description:
    "Enter events. Prove your ticket. Reveal nothing else. The world's first privacy-first event ticketing platform powered by Aleo Zero-Knowledge proofs.",
  keywords: ["Aleo", "Zero-Knowledge", "event ticketing", "privacy", "blockchain", "ZK-proof"],
  authors: [{ name: "PassMeet", url: SITE_URL }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "PassMeet",
    title: "PassMeet | Private Event Access on Aleo",
    description: "Enter events. Prove your ticket. Reveal nothing else. Privacy-first ticketing powered by ZK proofs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PassMeet | Private Event Access on Aleo",
    description: "Enter events. Prove your ticket. Reveal nothing else.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <AleoWalletProvider>
          <NetworkBanner />
          <Navbar />
          <main className="grow">
            {children}
          </main>
          <Footer />
          <Toaster position="bottom-right" theme="dark" />
        </AleoWalletProvider>
      </body>
    </html>
  );
}
