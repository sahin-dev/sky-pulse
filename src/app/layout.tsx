import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { MotionProvider } from "@/components/MotionProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SkyPulse — Live Flight Tracker", template: "%s · SkyPulse" },
  description: "Track any flight in real time: live position, route map, gates, terminals and delays.",
};

export const viewport: Viewport = {
  themeColor: "#03050d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col overflow-x-hidden font-sans">
        {/* Ambient aurora background */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[42rem] w-[70rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[140px]" />
          <div className="absolute top-1/3 -left-40 h-[30rem] w-[30rem] rounded-full bg-violet-600/10 blur-[120px]" />
          <div className="absolute right-[-10rem] bottom-0 h-[34rem] w-[34rem] rounded-full bg-cyan-500/[0.07] blur-[140px]" />
          <div className="grid-bg absolute inset-0" />
        </div>
        <MotionProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}
