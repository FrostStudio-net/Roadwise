"use client";

import { Home, Map, Route, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [{ label: "Home", href: "/", icon: Home }, { label: "Check", href: "/check", icon: Route }, { label: "Roads", href: "/roads", icon: Map }, { label: "Drive", href: "/drive", icon: ShieldAlert }];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="bottom-nav glass fixed left-1/2 z-50 -translate-x-1/2 rounded-[27px] p-1.5 shadow-2xl">
      <div className="grid grid-cols-4">
        {items.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href === "/drive" && pathname === "/just-drive");
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-1 rounded-[21px] py-2.5 text-[9px] font-medium tracking-wide transition ${active ? "bg-white/[0.065] text-[#e8c4b0]" : "text-[#788683]"}`}>
              {active && <span className="absolute top-1 h-1 w-1 rounded-full bg-[#d48c6b] shadow-[0_0_10px_#d48c6b]" />}
              <Icon size={18} strokeWidth={active ? 2 : 1.55} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
