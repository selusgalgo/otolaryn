"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftOnRectangleIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  HomeIcon,
  IdentificationIcon,
  UserIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/roles";
import type { Me, Role } from "@/lib/types";

// admin/profesional/recepcion only — superadmin never renders this sidebar
// at all ((app)/layout.tsx redirects it to /platform first).
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  roles: Role[];
  // Configuración lives in the ⋮ menu (UserMenu) on desktop now, not
  // repeated in the sidebar list too. Mobile's bottom nav has no ⋮ menu
  // though, so it still needs its own entry here to stay reachable there.
  hideFromDesktopNav?: boolean;
  // Narrower than `roles` — a profesional an admin has turned Agenda
  // access off for still has role "profesional", so the roles list alone
  // can't hide this one for them; see AgendaAccessGuard on the backend.
  hidden?: (me: Me) => boolean;
}[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: HomeIcon,
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
    hidden: (me) => me.role === "profesional" && !me.agendaAccess,
  },
  {
    href: "/users",
    label: "Usuarios",
    icon: IdentificationIcon,
    roles: ["admin"],
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: Cog6ToothIcon,
    roles: ["admin"],
    hideFromDesktopNav: true,
  },
];

function NavLinks({ me }: { me: Me }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => item.roles.includes(me.role) && !item.hideFromDesktopNav && !item.hidden?.(me),
  );

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
                ? "bg-black/10 text-nav-foreground"
                : "text-nav-foreground/70 hover:bg-black/10 hover:text-nav-foreground",
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
function MobileBottomNav({ me }: { me: Me }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(me.role) && !item.hidden?.(me));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-nav-foreground/10 bg-nav pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
              active ? "text-nav-foreground" : "text-nav-foreground/70",
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

// Desktop sidebar footer: avatar + name + role, with a ⋮ menu (Perfil,
// Configuración for admin, Cerrar sesión) instead of the previous two
// separately-spelled-out links. logoutAction takes no form to submit here —
// it's called directly (Server Actions are plain async functions, callable
// outside a <form> too), which sidesteps DropdownMenuContent's portal ever
// separating a <form> from its submit button in the DOM.
function UserMenu({ me }: { me: Me }) {
  return (
    <div className="border-t border-nav-foreground/10 p-3">
      <DropdownMenu>
        {/* The whole row is the trigger now, not just the ⋮ — asChild
            hands Radix's trigger behavior to this single <button> instead
            of nesting a second, separately-clickable button inside it. */}
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Menú de cuenta"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-black/10"
          >
            <Avatar firstName={me.firstName} lastName={me.lastName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-nav-foreground">
                {me.firstName} {me.lastName}
              </p>
              <p className="truncate text-xs text-nav-foreground/60">{ROLE_LABELS[me.role]}</p>
            </div>
            <EllipsisVerticalIcon className="size-4 shrink-0 text-nav-foreground/70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserIcon className="size-4" />
              Perfil
            </Link>
          </DropdownMenuItem>
          {me.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Cog6ToothIcon className="size-4" />
                Configuración
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logoutAction()}>
            <ArrowLeftOnRectangleIcon className="size-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({ me }: { me: Me }) {
  return (
    <>
      {/* Desktop: fixed sidebar, always visible */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-nav md:flex">
        <Link href="/dashboard" className="flex items-center border-b border-nav-foreground/10 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Mederi" className="h-7 w-auto" />
        </Link>
        <NavLinks me={me} />
        <UserMenu me={me} />
      </aside>

      {/* Mobile: top bar with logo + logout — navigation itself lives in the
          fixed bottom tab bar below, app-style, so there's no hamburger/drawer. */}
      <header className="flex items-center justify-between bg-nav px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Mederi" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            aria-label="Mi cuenta"
            className="rounded-lg p-2 text-nav-foreground/70 hover:bg-black/10 hover:text-nav-foreground"
          >
            <UserIcon className="size-5" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="rounded-lg p-2 text-nav-foreground/70 hover:bg-black/10 hover:text-nav-foreground"
            >
              <ArrowLeftOnRectangleIcon className="size-5" />
            </button>
          </form>
        </div>
      </header>

      <MobileBottomNav me={me} />
    </>
  );
}
