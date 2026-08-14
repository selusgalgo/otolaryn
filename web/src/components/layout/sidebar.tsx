"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import type { Role } from "@/lib/types";

// admin/profesional/recepcion only — superadmin never renders this sidebar
// at all ((app)/layout.tsx redirects it to /platform first).
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  roles: Role[];
}[] = [
  {
    href: "/dashboard",
    label: "Escritorio",
    icon: LayoutDashboardIcon,
    roles: ["admin", "profesional", "recepcion"],
  },
  {
    href: "/patients",
    label: "Pacientes",
    icon: UsersIcon,
    roles: ["admin", "profesional", "recepcion"],
  },
  {
    href: "/appointments",
    label: "Agenda",
    icon: CalendarDaysIcon,
    roles: ["admin", "profesional", "recepcion"],
  },
  {
    href: "/users",
    label: "Usuarios",
    icon: UserCogIcon,
    roles: ["admin"],
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: SettingsIcon,
    roles: ["admin"],
  },
];

function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
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

// Bottom tab bar, mobile only — icon-over-label, native-app style.
function MobileBottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-primary-foreground/10 bg-primary pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
              active ? "text-primary-foreground" : "text-primary-foreground/70",
            )}
          >
            <span className={cn("rounded-full px-3 py-0.5", active && "bg-black/10")}>
              <Icon className="size-5" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutForm() {
  return (
    <div className="border-t border-primary-foreground/10 p-3">
      <Link
        href="/account"
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-black/10 hover:text-primary-foreground"
      >
        <UserIcon className="size-4 shrink-0" />
        Mi cuenta
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground/70 transition-colors hover:bg-black/10 hover:text-primary-foreground"
        >
          <LogOutIcon className="size-4 shrink-0" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <>
      {/* Desktop: fixed sidebar, always visible */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-primary md:flex">
        <Link href="/dashboard" className="flex items-center border-b border-primary-foreground/10 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
        </Link>
        <NavLinks role={role} />
        <LogoutForm />
      </aside>

      {/* Mobile: top bar with logo + logout — navigation itself lives in the
          fixed bottom tab bar below, app-style, so there's no hamburger/drawer. */}
      <header className="flex items-center justify-between bg-primary px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Otolaryn" className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            aria-label="Mi cuenta"
            className="rounded-lg p-2 text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground"
          >
            <UserIcon className="size-5" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="rounded-lg p-2 text-primary-foreground/70 hover:bg-black/10 hover:text-primary-foreground"
            >
              <LogOutIcon className="size-5" />
            </button>
          </form>
        </div>
      </header>

      <MobileBottomNav role={role} />
    </>
  );
}
