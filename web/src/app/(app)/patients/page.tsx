import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import type { Paginated, Patient } from "@/lib/types";

const PAGE_SIZE = 20;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;

  const result = await apiFetch<Paginated<Patient>>(`/patients?page=${page}&pageSize=${PAGE_SIZE}`);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pacientes</h1>
        <Button asChild>
          <Link href="/patients/new">Nuevo paciente</Link>
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha de nacimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No hay pacientes todavía.
                </TableCell>
              </TableRow>
            )}
            {result.data.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell>
                  <Link href={`/patients/${patient.id}`} className="hover:underline">
                    {patient.firstName} {patient.lastName}
                  </Link>
                </TableCell>
                <TableCell>{patient.documentId}</TableCell>
                <TableCell>{patient.phone}</TableCell>
                <TableCell>{patient.dateOfBirth}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {result.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients?page=${page - 1}`}>Anterior</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients?page=${page + 1}`}>Siguiente</Link>
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
