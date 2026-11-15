"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Suspense, useState } from "react";
import { Radar, Search } from "lucide-react";
import { Logo } from "./Logo";
import clsx from "clsx";

const LINKS = [
  { href: "/#radar", label: "Live radar", icon: Radar },
  { href: "/search", label: "Search", icon: Search },
];

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
      className="sticky top-0 z-[1000] px-4 pt-3"
    >
      <nav
        className={clsx(
          "mx-auto flex max-w-7xl items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-500",
          scrolled ? "glass-strong shadow-[0_10px_40px_rgb(0_0_0/0.45)]" : "border border-transparent",
        )}
      >
        <Link href="/" aria-label="SkyPulse home">
          <Logo />
        </Link>
        <Suspense fallback={<NavLinks pathname="" />}>
          <PathAwareLinks />
        </Suspense>
      </nav>
    </motion.header>
  );
}

function PathAwareLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <div className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/search" && pathname.startsWith("/search");
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white",
              active && "text-white",
            )}
          >
            {active && (
              <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-white/[0.07]" />
            )}
            <Icon className="relative size-4" />
            <span className="relative hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
