import Link from "next/link";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreatePatientDialog } from "@/components/patients/create-patient-dialog";
import { PatientsActionsMenu } from "@/components/patients/patients-actions-menu";
import { PatientsTable } from "@/components/patients/patients-table";
import { getActiveAntecedenteTypes } from "@/lib/antecedentes";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getInsuranceOptions } from "@/lib/insurance";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { Paginated, Patient } from "@/lib/types";

const PAGE_SIZE = 20;

type PatientSortBy = "name" | "dateOfBirth";
type SortDirection = "asc" | "desc";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const search = params.search?.trim() || "";
  const sortBy: PatientSortBy | undefined =
    params.sortBy === "name" || params.sortBy === "dateOfBirth" ? params.sortBy : undefined;
  const sortDir: SortDirection = params.sortDir === "desc" ? "desc" : "asc";

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));
  if (search) query.set("search", search);
  if (sortBy) {
    query.set("sortBy", sortBy);
    query.set("sortDir", sortDir);
  }

  const [result, me, insuranceOptions, practitionerOptions, antecedenteTypes] =
    await Promise.all([
      apiFetch<Paginated<Patient>>(`/patients?${query.toString()}`),
      getCurrentUser(),
      getInsuranceOptions(),
      getPractitionerOptions(),
      getActiveAntecedenteTypes(),
    ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) => {
    const href = new URLSearchParams();
    href.set("page", String(p));
    if (search) href.set("search", search);
    if (sortBy) {
      href.set("sortBy", sortBy);
      href.set("sortDir", sortDir);
    }
    return `/patients?${href.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold">Pacientes</h1>
          {/* Comprobación temporal de la migración: contraste rápido contra
              el nº de filas de pacientes.xls sin tener que contar páginas.
              Quitar cuando la migración quede verificada. */}
          <span className="text-sm text-muted-foreground">({result.total} en total)</span>
        </div>
        <div className="flex items-center gap-2">
          <PatientsActionsMenu
            antecedenteTypes={antecedenteTypes ?? undefined}
            showImportClinicalEntries={me.role !== "recepcion"}
            practitioners={practitionerOptions}
            search={search}
          />
          <CreatePatientDialog
            insuranceOptions={insuranceOptions}
            practitionerOptions={practitionerOptions}
          />
        </div>
      </div>

      <form className="flex items-end gap-4" action="/patients">
        <div className="flex-1 space-y-2">
          <Label htmlFor="search">Buscar paciente</Label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              name="search"
              defaultValue={search}
              placeholder="Nombre, apellidos o documento..."
              className="pl-8"
            />
          </div>
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {search && (
          <Button asChild variant="ghost">
            <Link href="/patients">Limpiar</Link>
          </Button>
        )}
      </form>

      {/* Keyed by page+search so navigating (a new page, a new filter) mounts
          a fresh table instead of keeping a stale selection made against a
          different set of rows. */}
      <PatientsTable
        key={`${page}-${search}-${sortBy ?? ""}-${sortDir}`}
        patients={result.data}
        emptyMessage={search ? "Sin resultados para esa búsqueda." : "No hay pacientes todavía."}
        // recepcion puede crear/editar pacientes para dar citas, pero
        // archivar (dar de baja) es una decisión clínica/administrativa —
        // el backend ya devuelve 403 para ese rol en ambas rutas de baja,
        // esto solo evita ofrecer un botón que siempre fallaría.
        canArchive={me.role !== "recepcion"}
        insuranceOptions={insuranceOptions}
        practitionerOptions={practitionerOptions}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-button text-button text-muted-foreground uppercase">
            Mostrando {result.data.length} de {result.total} pacientes
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="icon-sm" aria-label="Página anterior">
                <Link href={pageHref(page - 1)}>
                  <ChevronLeftIcon className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon-sm" disabled aria-label="Página anterior">
                <ChevronLeftIcon className="size-4" />
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {result.page}/{totalPages}
            </span>
            {page < totalPages ? (
              <Button asChild variant="outline" size="icon-sm" aria-label="Página siguiente">
                <Link href={pageHref(page + 1)}>
                  <ChevronRightIcon className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon-sm" disabled aria-label="Página siguiente">
                <ChevronRightIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
