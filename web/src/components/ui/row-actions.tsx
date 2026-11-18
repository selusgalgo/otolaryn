"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowAction {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export function RowActions({
  actions,
  overflowLabel = "Más acciones",
  reserveSpaceWhenEmpty = false,
}: {
  actions: RowAction[];
  overflowLabel?: string;
  reserveSpaceWhenEmpty?: boolean;
}) {
  const visibleActions = actions.slice(0, 3);
  const overflowActions = actions.slice(3);

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.length === 0 && reserveSpaceWhenEmpty && <span aria-hidden="true" className="size-9" />}
      {visibleActions.map((action) => {
        const destructiveClass = action.destructive ? "text-destructive hover:text-destructive" : undefined;

        if (action.href) {
          return (
            <Button
              key={action.id}
              asChild
              variant="ghost"
              size="icon"
              aria-label={action.label}
              title={action.label}
              className={destructiveClass}
            >
              <Link href={action.href}>{action.icon}</Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.id}
            variant="ghost"
            size="icon"
            aria-label={action.label}
            title={action.label}
            onClick={action.onSelect}
            disabled={action.disabled}
            className={destructiveClass}
          >
            {action.icon}
          </Button>
        );
      })}

      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={overflowLabel} title={overflowLabel}>
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowActions.map((action) => {
              const className = action.destructive
                ? "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                : undefined;

              if (action.href) {
                return (
                  <DropdownMenuItem key={action.id} asChild className={className}>
                    <Link href={action.href}>
                      {action.icon}
                      {action.label}
                    </Link>
                  </DropdownMenuItem>
                );
              }

              return (
                <DropdownMenuItem
                  key={action.id}
                  onSelect={action.onSelect}
                  disabled={action.disabled}
                  className={className}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
