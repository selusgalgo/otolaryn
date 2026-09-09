import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreatePatientDialog } from "@/components/patients/create-patient-dialog";
import { ExportPatientsMenu } from "@/components/patients/export-patients-menu";
import { ImportPatientsDialog } from "@/components/patients/import-patients-dialog";
import { PatientsTable } from "@/components/patients/patients-table";
import { apiFetch } from "@/lib/api";
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

  const result = await apiFetch<Paginated<Patient>>(`/patients?${query.toString()}`);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (p: number) =>
    `/patients?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <div className="flex items-center gap-2">
          <ImportPatientsDialog />
          <ExportPatientsMenu search={search} />
          <CreatePatientDialog />
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
