"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Escritorio", icon: LayoutDashboardIcon },
  { href: "/patients", label: "Pacientes", icon: UsersIcon },
  { href: "/appointments", label: "Agenda", icon: CalendarDaysIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-black/10 text-primary-foreground"
                : "text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutForm() {
  return (
    <form action={logoutAction} className="border-t border-primary-foreground/10 p-3">
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-black/10 hover:text-primary-foreground"
      >
        <LogOutIcon className="size-4 shrink-0" />
        Cerrar sesión
      </button>
    </form>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed sidebar, always visible */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-primary md:flex">
        <Link href="/patients" className="flex items-center border-b border-primary-foreground/10 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
        </Link>
        <NavLinks />
        <LogoutForm />
      </aside>

      {/* Mobile: top bar with hamburger */}
      <header className="flex items-center justify-between bg-primary px-4 py-3 md:hidden">
        <Link href="/patients" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground"
        >
          <MenuIcon className="size-5" />
        </button>
      </header>

      {/* Mobile: slide-in drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-primary">
            <div className="flex items-center justify-between border-b border-primary-foreground/10 px-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
              <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="rounded-lg p-1 text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <LogoutForm />
          </aside>
        </div>
      )}
    </>
  );
}
