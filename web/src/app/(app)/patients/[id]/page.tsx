import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";
import { ApiError, apiFetch } from "@/lib/api";
import type { Patient } from "@/lib/types";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {patient.firstName} {patient.lastName}
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/patients/${patient.id}/edit`}>Editar</Link>
          </Button>
          <DeletePatientButton id={patient.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del paciente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Documento</div>
            <div>{patient.documentId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fecha de nacimiento</div>
            <div>{patient.dateOfBirth}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Teléfono</div>
            <div>{patient.phone}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Email</div>
            <div>{patient.email ?? "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Dirección</div>
            <div>{patient.address ?? "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Notas</div>
            <div>{patient.notes ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
