"use client";

import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
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
import { UpdatePatientsDialog } from "@/components/patients/update-patients-dialog";
import type { PractitionerOption } from "@/lib/practitioners";
import type { AntecedenteType } from "@/lib/types";

interface PatientsActionsMenuProps {
  antecedenteTypes?: AntecedenteType[];
  // Importar/Actualizar pacientes y Exportar son cosa de admin/recepcion —
  // un profesional puede ver y editar fichas una a una, pero las
  // operaciones en bloque sobre todo el listado no (el backend ya
  // devuelve 403 en estas rutas para ese rol, esto solo evita ofrecer
  // botones que siempre fallarían).
  canManagePatientData: boolean;
  // Historia clínica es territorio clínico, igual que la propia
  // importación de antecedentes — solo admin, ni recepcion ni profesional
  // tienen acceso (el backend ya devuelve 403 en /clinical-entries/import).
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
  canManagePatientData,
  showImportClinicalEntries,
  practitioners,
  search,
}: PatientsActionsMenuProps) {
  const [importPatientsOpen, setImportPatientsOpen] = useState(false);
  const [updatePatientsOpen, setUpdatePatientsOpen] = useState(false);
  const [importClinicalOpen, setImportClinicalOpen] = useState(false);
  const suffix = search ? `&search=${encodeURIComponent(search)}` : "";

  // Un profesional no tiene ninguna de estas acciones — nada que mostrar,
  // así que el botón "Acciones" entero desaparece en vez de abrir un menú
  // vacío.
  if (!canManagePatientData && !showImportClinicalEntries) {
    return null;
  }

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
          {canManagePatientData && (
            <>
              <DropdownMenuItem onSelect={() => setImportPatientsOpen(true)}>
                <ArrowUpTrayIcon data-icon="inline-start" />
                Importar pacientes
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setUpdatePatientsOpen(true)}>
                <ArrowPathIcon data-icon="inline-start" />
                Actualizar pacientes
              </DropdownMenuItem>
            </>
          )}
          {showImportClinicalEntries && (
            <DropdownMenuItem onSelect={() => setImportClinicalOpen(true)}>
              <ArrowUpTrayIcon data-icon="inline-start" />
              Importar consultas
            </DropdownMenuItem>
          )}
          {canManagePatientData && (
            <>
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManagePatientData && (
        <>
          <ImportPatientsDialog
            antecedenteTypes={antecedenteTypes}
            open={importPatientsOpen}
            onOpenChange={setImportPatientsOpen}
            hideTrigger
          />
          <UpdatePatientsDialog
            antecedenteTypes={antecedenteTypes}
            open={updatePatientsOpen}
            onOpenChange={setUpdatePatientsOpen}
            hideTrigger
          />
        </>
      )}
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
