import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PatientAntecedentesCard } from "@/components/patients/patient-antecedentes-card";
import { PatientNotesCard } from "@/components/patients/patient-notes-card";
import { PatientProfileSection } from "@/components/patients/patient-profile-section";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getInsuranceOptions } from "@/lib/insurance";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { AntecedenteType, ClinicalEntry, Paginated, Patient, PatientAntecedente } from "@/lib/types";
import { stripHtml } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let patient: Patient;
  try {
    patient = await apiFetch<Patient>(`/patients/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const me = await getCurrentUser();
  // recepcion has no access to clinical history at all — the backend 403s
  // this endpoint for that role, so it's skipped entirely rather than
  // fetched and hidden. Antecedentes are clinical data too, same
  // exclusion.
  const [entries, practitioners, insuranceOptions, antecedentes] =
    await Promise.all([
      me.role === "recepcion"
        ? null
        : apiFetch<Paginated<ClinicalEntry>>(`/patients/${id}/clinical-entries?pageSize=50`),
      getPractitionerOptions(),
      getInsuranceOptions(),
      me.role === "recepcion"
        ? null
        : Promise.all([
            apiFetch<AntecedenteType[]>("/antecedente-types"),
            apiFetch<PatientAntecedente[]>(`/patients/${id}/antecedentes`),
          ]),
    ]);

  const insuranceName = insuranceOptions.find((o) => o.id === patient.insuranceEntityId)?.label;

  // practitioners is null for a profesional (getPractitionerOptions 403s
  // /users?role=profesional for that role) — the only name worth assuming
  // in that case is their own, same fallback appointments/page.tsx uses.
  const practitionerNameById = new Map(practitioners?.map((p) => [p.id, p.label]));
  function authorNameFor(entry: ClinicalEntry): string | null {
    const name = practitionerNameById.get(entry.authorUserId);
    if (name) return name;
    return me.role === "profesional" ? `${me.firstName} ${me.lastName}` : null;
  }

  return (
    <div className="space-y-4">
      <PatientProfileSection
        patient={patient}
        insuranceOptions={insuranceOptions}
        insuranceName={insuranceName}
        practitionerOptions={practitioners}
      />

      {/* Debajo, a ancho completo: Historia clínica y Antecedentes (solo
          admin/profesional, que tienen acceso clínico) y, cerrando la
          página, Notas — visible para todos los roles, a diferencia del
          resto de este bloque. Below md todo se apila en una columna en
          este mismo orden de arriba a abajo. */}
      {entries !== null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Historia clínica</CardTitle>
              <Button asChild size="sm">
                <Link href={`/patients/${id}/clinical-entries/new`}>
                  <PlusIcon data-icon="inline-start" />
                  Nueva consulta
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {entries.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin entradas todavía.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="hidden md:table-cell">Doctor</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.data.map((entry) => {
                      const authorName = authorNameFor(entry);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">
                            <Link
                              href={`/patients/${id}/clinical-entries/${entry.id}`}
                              className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-button text-button text-slate-700 uppercase hover:bg-slate-200"
                            >
                              {formatDate(entry.visitDate)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {stripHtml(entry.chiefComplaint)}
                            {/* En escritorio el doctor vive en su propia
                                columna — en móvil, donde esa columna se
                                oculta, se muestra aquí debajo para no
                                perder el dato. */}
                            {authorName && (
                              <div className="text-left text-xs text-muted-foreground md:hidden">
                                {authorName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{authorName ?? "—"}</TableCell>
                          <TableCell>
                            <Button asChild variant="ghost" size="icon" aria-label="Ver esta consulta">
                              <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>
                                <EyeIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {antecedentes !== null && (
            <PatientAntecedentesCard
              patientId={id}
              types={antecedentes[0]}
              initialMarked={antecedentes[1]}
            />
          )}
        </div>
      )}

      <PatientNotesCard patientId={id} notes={patient.notes} />
    </div>
  );
}
