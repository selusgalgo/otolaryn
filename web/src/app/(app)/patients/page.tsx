import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImportClinicalEntriesDialog } from "@/components/clinical-entries/import-clinical-entries-dialog";
import { CreatePatientDialog } from "@/components/patients/create-patient-dialog";
import { ExportPatientsMenu } from "@/components/patients/export-patients-menu";
import { ImportPatientsDialog } from "@/components/patients/import-patients-dialog";
import { PatientsTable } from "@/components/patients/patients-table";
import { getActiveAntecedenteTypes } from "@/lib/antecedentes";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getInsuranceOptions } from "@/lib/insurance";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { Paginated, Patient } from "@/lib/types";

const PAGE_SIZE = 20;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const search = params.search?.trim() || "";

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));
  if (search) query.set("search", search);

  const [result, me, insuranceOptions, practitionerOptions, antecedenteTypes] =
    await Promise.all([
      apiFetch<Paginated<Patient>>(`/patients?${query.toString()}`),
      getCurrentUser(),
      getInsuranceOptions(),
      getPractitionerOptions(),
      getActiveAntecedenteTypes(),
    ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) =>
    `/patients?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <div className="flex items-center gap-2">
          <ImportPatientsDialog antecedenteTypes={antecedenteTypes ?? undefined} />
          {/* Historia clínica es territorio clínico, igual que la propia
              importación de antecedentes — recepcion no tiene acceso
              (el backend ya devuelve 403 en /clinical-entries/import). */}
          {me.role !== "recepcion" && (
            <ImportClinicalEntriesDialog practitioners={practitionerOptions} />
          )}
          <ExportPatientsMenu search={search} />
          <CreatePatientDialog
            insuranceOptions={insuranceOptions}
            practitionerOptions={practitionerOptions}
          />
        </div>
      </div>

      <form className="flex items-end gap-4" action="/patients">
        <div className="flex-1 space-y-2">
          <Label htmlFor="search">Buscar paciente</Label>
          <Input id="search" name="search" defaultValue={search} placeholder="Nombre, apellidos o documento..." />
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
        key={`${page}-${search}`}
        patients={result.data}
        emptyMessage={search ? "Sin resultados para esa búsqueda." : "No hay pacientes todavía."}
        // recepcion puede crear/editar pacientes para dar citas, pero
        // archivar (dar de baja) es una decisión clínica/administrativa —
        // el backend ya devuelve 403 para ese rol en ambas rutas de baja,
        // esto solo evita ofrecer un botón que siempre fallaría.
        canArchive={me.role !== "recepcion"}
        insuranceOptions={insuranceOptions}
        practitionerOptions={practitionerOptions}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {result.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>Anterior</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Siguiente</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
