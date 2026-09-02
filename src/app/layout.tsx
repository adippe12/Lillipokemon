import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BASE_PATH } from "@/lib/base-path";

const pressStart = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

const vt323 = VT323({
  variable: "--font-lcd",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-sans-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LILLIPEDEX — Live Pokedex for lillimon_",
  description:
    "A live Pokedex that watches Twitch chat of lillimon_. Every 'sillymon', 'eepymon' or 'sleepymon' in chat gets catalogued. Propose descriptions and artwork, reviewed by the channel team.",
  icons: {
    icon: `${BASE_PATH}/icon.svg`,
  },
  openGraph: {
    title: "LILLIPEDEX",
    description: "Live creature discovery from Twitch chat — every mention is catalogued.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#101019",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${pressStart.variable} ${vt323.variable} ${inter.variable} antialiased bg-background text-foreground font-body`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
