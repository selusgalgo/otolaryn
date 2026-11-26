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
  overflowOnly?: boolean;
  visibleLabel?: string;
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
  const eligibleActions = actions.filter((action) => !action.overflowOnly);
  const visibleActions = eligibleActions.slice(0, 3);
  const visibleIds = new Set(visibleActions.map((action) => action.id));
  const overflowActions = actions.filter(
    (action) => !visibleIds.has(action.id),
  );

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.length === 0 && reserveSpaceWhenEmpty && (
        <span aria-hidden="true" className="size-9" />
      )}
      {visibleActions.map((action) => {
        const destructiveClass = action.destructive
          ? "text-destructive hover:text-destructive"
          : undefined;

        if (action.href) {
          return (
            <Button
              key={action.id}
              asChild
              variant="ghost"
              size={action.visibleLabel ? "sm" : "icon"}
              aria-label={action.label}
              title={action.label}
              className={`${destructiveClass ?? ""} ${action.visibleLabel ? "h-8 gap-1 px-2 text-xs" : ""}`}
            >
              <Link href={action.href}>
                {action.icon}
                {action.visibleLabel && <span>{action.visibleLabel}</span>}
              </Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.id}
            variant="ghost"
            size={action.visibleLabel ? "sm" : "icon"}
            aria-label={action.label}
            title={action.label}
            onClick={action.onSelect}
            disabled={action.disabled}
            className={`${destructiveClass ?? ""} ${action.visibleLabel ? "h-8 gap-1 px-2 text-xs" : ""}`}
          >
            {action.icon}
            {action.visibleLabel && <span>{action.visibleLabel}</span>}
          </Button>
        );
      })}

      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={overflowLabel}
              title={overflowLabel}
            >
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
                  <DropdownMenuItem
                    key={action.id}
                    asChild
                    className={className}
                  >
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
