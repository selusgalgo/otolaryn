'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftOnRectangleIcon,
  BuildingOffice2Icon,
  CreditCardIcon,
  CircleStackIcon,
  EllipsisVerticalIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/lib/actions/auth';
import { userDisplayName } from '@/lib/doctor-name';
import { ROLE_LABELS } from '@/lib/roles';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/platform', label: 'Clínicas', icon: BuildingOffice2Icon },
  { href: '/platform/billing', label: 'Facturación', icon: CreditCardIcon },
  { href: '/platform/backups', label: 'Copias', icon: CircleStackIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/platform') {
    return (
      pathname === href ||
      (pathname.startsWith(`${href}/`) &&
        !NAV_ITEMS.slice(1).some(
          (item) =>
            pathname === item.href || pathname.startsWith(`${item.href}/`),
        ))
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={
        mobile
          ? 'fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-nav-foreground/10 bg-nav pb-[env(safe-area-inset-bottom)] md:hidden'
          : 'flex-1 space-y-1 p-3'
      }
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              mobile
                ? 'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors'
                : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? mobile
                  ? 'text-nav-foreground'
                  : 'bg-white/10 text-nav-foreground'
                : mobile
                  ? 'text-nav-foreground/70'
                  : 'text-nav-foreground/70 hover:bg-white/5 hover:text-nav-foreground',
            )}
          >
            {mobile ? (
              <span
                className={cn(
                  'rounded-full px-3 py-0.5',
                  active && 'bg-white/10',
                )}
              >
                <Icon className="size-5" />
              </span>
            ) : (
              <Icon className="size-4 shrink-0" />
            )}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PlatformUserMenu({ me }: { me: Me }) {
  return (
    <div className="border-t border-nav-foreground/10 p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Menú de cuenta"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/10"
          >
            <Avatar firstName={me.firstName} lastName={me.lastName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-nav-foreground">
                {userDisplayName(me)}
              </p>
              <p className="truncate text-xs text-nav-foreground/60">
                {ROLE_LABELS[me.role]}
              </p>
            </div>
            <EllipsisVerticalIcon className="size-4 shrink-0 text-nav-foreground/70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem asChild>
            <Link href="/account">
              <UserIcon className="size-4" />
              Mi cuenta
            </Link>
          </DropdownMenuItem>
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

export function PlatformSidebar({ me }: { me: Me }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-nav md:flex">
        <Link
          href="/platform"
          className="flex items-center gap-3 border-b border-nav-foreground/10 px-4 py-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Mederi" className="h-9 w-auto" />
          <span className="text-sm font-medium text-nav-foreground/70">
            Panel Eiduo
          </span>
        </Link>
        <NavLinks />
        <PlatformUserMenu me={me} />
      </aside>

      <header className="flex items-center justify-between bg-nav px-4 py-3 md:hidden">
        <Link href="/platform" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG, next/image adds no value here */}
          <img src="/logo-on-dark.svg" alt="Mederi" className="h-9 w-auto" />
          <span className="hidden text-sm font-medium text-nav-foreground/70 sm:inline">
            Panel Eiduo
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            aria-label="Mi cuenta"
            className="rounded-lg p-2 text-nav-foreground/70 hover:bg-white/10 hover:text-nav-foreground"
          >
            <UserIcon className="size-5" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="rounded-lg p-2 text-nav-foreground/70 hover:bg-white/10 hover:text-nav-foreground"
            >
              <ArrowLeftOnRectangleIcon className="size-5" />
            </button>
          </form>
        </div>
      </header>

      <NavLinks mobile />
    </>
  );
}
