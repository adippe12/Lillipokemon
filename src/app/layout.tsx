import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const baloo = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const nunito = Nunito({
  variable: "--font-soft",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "LILLIPEDEX — Live Pokedex for lillimon_",
  description:
    "A sweet live Pokedex that watches Twitch chat of lillimon_. Every 'sillymon', 'eepymon' or any word ending in 'mon' becomes a new friend. Propose descriptions and artwork, reviewed by the channel team.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "LILLIPEDEX",
    description: "Live creature discovery from Twitch chat — every mention becomes a new friend.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff8f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${baloo.variable} ${nunito.variable} antialiased bg-background text-foreground font-body`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
