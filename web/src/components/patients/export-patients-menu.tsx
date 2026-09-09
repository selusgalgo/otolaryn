"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Plain <a> links to the /patients/export Route Handler, not a Server
// Action — a file download is a GET navigation the browser handles
// natively (Content-Disposition: attachment), no client-side JS needed
// beyond opening the menu itself. Carries the current search filter along,
// so exporting from a filtered list exports exactly what's on screen.
export function ExportPatientsMenu({ search }: { search?: string }) {
  const suffix = search ? `&search=${encodeURIComponent(search)}` : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <DownloadIcon data-icon="inline-start" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`/patients/export?format=csv${suffix}`}>Exportar CSV</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/patients/export?format=xlsx${suffix}`}>Exportar Excel (XLSX)</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
