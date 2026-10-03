"use client";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Wraps one category's AntecedenteTypesForm in its own collapsible Card —
// the parent page lays two of these side by side on wider screens (desktop:
// personales | familiares), where both stay open by default since there's
// room; on narrow screens they stack and the chevron lets each one close
// like a dropdown, so reviewing one category doesn't mean scrolling past the
// other's full list first.
export function AntecedenteCategoryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Collapsible defaultOpen>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
            <CardTitle className="text-base">{title}</CardTitle>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-open:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
