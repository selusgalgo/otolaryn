"use client";

import { useState } from "react";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImportClinicalEntriesDialog } from "@/components/clinical-entries/import-clinical-entries-dialog";
import { ImportPatientsDialog } from "@/components/patients/import-patients-dialog";
import type { PractitionerOption } from "@/lib/practitioners";
import type { AntecedenteType } from "@/lib/types";

interface PatientsActionsMenuProps {
  antecedenteTypes?: AntecedenteType[];
  // Historia clínica es territorio clínico, igual que la propia
  // importación de antecedentes — recepcion no tiene acceso (el backend ya
  // devuelve 403 en /clinical-entries/import).
  showImportClinicalEntries: boolean;
  practitioners?: PractitionerOption[] | null;
  search?: string;
}

// Agrupa Importar/Importar consultas/Exportar bajo un único menú de
// "Acciones" — Nuevo paciente se queda como botón aparte, es la acción
// principal de esta página. Cada import sigue siendo su propio Dialog
// (con su propio asistente de varios pasos), solo con el trigger oculto y
// el open controlado desde aquí en vez de un botón propio.
export function PatientsActionsMenu({
  antecedenteTypes,
  showImportClinicalEntries,
  practitioners,
  search,
}: PatientsActionsMenuProps) {
  const [importPatientsOpen, setImportPatientsOpen] = useState(false);
  const [importClinicalOpen, setImportClinicalOpen] = useState(false);
  const suffix = search ? `&search=${encodeURIComponent(search)}` : "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <EllipsisVerticalIcon data-icon="inline-start" />
            Acciones
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setImportPatientsOpen(true)}>
            <ArrowUpTrayIcon data-icon="inline-start" />
            Importar pacientes
          </DropdownMenuItem>
          {showImportClinicalEntries && (
            <DropdownMenuItem onSelect={() => setImportClinicalOpen(true)}>
              <ArrowUpTrayIcon data-icon="inline-start" />
              Importar consultas
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={`/patients/export?format=csv${suffix}`}>
              <ArrowDownTrayIcon data-icon="inline-start" />
              Exportar CSV
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/patients/export?format=xlsx${suffix}`}>
              <ArrowDownTrayIcon data-icon="inline-start" />
              Exportar Excel (XLSX)
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportPatientsDialog
        antecedenteTypes={antecedenteTypes}
        open={importPatientsOpen}
        onOpenChange={setImportPatientsOpen}
        hideTrigger
      />
      {showImportClinicalEntries && (
        <ImportClinicalEntriesDialog
          practitioners={practitioners}
          open={importClinicalOpen}
          onOpenChange={setImportClinicalOpen}
          hideTrigger
        />
      )}
    </>
  );
}
