"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CameraIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { updatePatientAction, type PatientFormState } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Patient } from "@/lib/types";
import { calculateAge, formatDateOnly, formatDocumentId } from "@/lib/utils";

interface PatientProfileSectionProps {
  patient: Patient;
  insuranceOptions?: InsuranceOption[];
  insuranceName?: string;
  practitionerOptions?: PractitionerOption[] | null;
}

const initialState: PatientFormState = {};

// Migas de pan + acciones (Editar/Dar de baja) y los widgets de
// identidad/datos del paciente viven juntos aquí porque "Editar" ya no
// abre un modal ni cambia de tarjeta — los mismos dos widgets se quedan
// donde están, solo que cada valor pasa a ser su campo editable, con
// Guardar/Cancelar debajo de ambos.
export function PatientProfileSection({
  patient,
  insuranceOptions,
  insuranceName,
  practitionerOptions,
}: PatientProfileSectionProps) {
  const [editing, setEditing] = useState(false);
  // formatDocumentId returns "-" for a missing/placeholder document — blank
  // reads better than a lone dash for an empty field in this ficha.
  const documentDisplay = formatDocumentId(patient.documentId);
  const boundUpdate = updatePatientAction.bind(null, patient.id);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/patients" className="hover:text-foreground hover:underline">
            Pacientes
          </Link>
          <span>›</span>
          <span className="text-foreground">
            {patient.firstName} {patient.lastName}
          </span>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              Editar
            </Button>
            <CreateAppointmentDialog patientId={patient.id} practitioners={practitionerOptions} />
          </div>
        )}
      </div>

      {editing ? (
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-3">
              <CardContent className="flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
                  {/* Sin backend de almacenamiento de fotos todavía — el
                      hueco visual ya está aquí para cuando lo haya. */}
                  <button
                    type="button"
                    aria-label="Añadir foto"
                    className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs hover:text-foreground"
                    disabled={pending}
                  >
                    <CameraIcon className="size-3.5" />
                  </button>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 text-left">
                  <div className="space-y-1">
                    <Label htmlFor="firstName" className="text-xs">
                      Nombre
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      defaultValue={patient.firstName}
                      required
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lastName" className="text-xs">
                      Apellidos
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      defaultValue={patient.lastName}
                      required
                      disabled={pending}
                    />
                  </div>
                </div>
                <div className="w-full space-y-1 text-left">
                  <Label htmlFor="documentId" className="text-xs">
                    Documento (DNI/NIE)
                  </Label>
                  <Input
                    id="documentId"
                    name="documentId"
                    defaultValue={patient.documentId ?? ""}
                    maxLength={20}
                    disabled={pending}
                  />
                </div>
                <div className="w-full space-y-1 text-left">
                  <Label htmlFor="profession" className="text-xs">
                    Profesión
                  </Label>
                  <Input
                    id="profession"
                    name="profession"
                    defaultValue={patient.profession ?? ""}
                    disabled={pending}
                  />
                </div>
                <div className="w-full space-y-1 text-left">
                  <Label htmlFor="insuranceEntityId" className="text-xs">
                    Aseguradora
                  </Label>
                  <select
                    id="insuranceEntityId"
                    name="insuranceEntityId"
                    defaultValue={patient.insuranceEntityId ?? ""}
                    disabled={pending}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
                  >
                    <option value="">Sin especificar</option>
                    {insuranceOptions?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-9">
              <CardHeader>
                <CardTitle className="text-base">Datos del paciente</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <Label htmlFor="dateOfBirth" className="text-xs text-muted-foreground">
                    Fecha de nacimiento
                  </Label>
                  <Input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    defaultValue={patient.dateOfBirth?.slice(0, 10)}
                    required
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs text-muted-foreground">
                    Teléfono
                  </Label>
                  <Input id="phone" name="phone" defaultValue={patient.phone} required disabled={pending} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone2" className="text-xs text-muted-foreground">
                    Teléfono 2
                  </Label>
                  <Input id="phone2" name="phone2" defaultValue={patient.phone2 ?? ""} disabled={pending} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={patient.email ?? ""}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="address" className="text-xs text-muted-foreground">
                    Dirección
                  </Label>
                  <Input id="address" name="address" defaultValue={patient.address ?? ""} disabled={pending} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="postalCode" className="text-xs text-muted-foreground">
                    C.P.
                  </Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    maxLength={10}
                    defaultValue={patient.postalCode ?? ""}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="city" className="text-xs text-muted-foreground">
                    Ciudad/Población
                  </Label>
                  <Input id="city" name="city" defaultValue={patient.city ?? ""} disabled={pending} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="province" className="text-xs text-muted-foreground">
                    Provincia
                  </Label>
                  <Input id="province" name="province" defaultValue={patient.province ?? ""} disabled={pending} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Primera consulta</Label>
                  {/* Ya no es un campo editable — se calcula solo a partir
                      de la consulta más antigua de Historia clínica, así
                      que no puede desincronizarse de lo que esta diga. */}
                  <p className="flex h-9 items-center text-sm">
                    {patient.firstConsultationDate ? formatDateOnly(patient.firstConsultationDate) : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <Card className="md:col-span-3">
            <CardContent className="flex flex-col items-center gap-3 text-center">
              <div className="relative">
                <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
                {/* Sin backend de almacenamiento de fotos todavía — el hueco
                    visual ya está aquí para cuando lo haya, ver conversación
                    sobre el alcance real de esta función. */}
                <button
                  type="button"
                  aria-label="Añadir foto"
                  className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs hover:text-foreground"
                >
                  <CameraIcon className="size-3.5" />
                </button>
              </div>
              <div className="text-lg font-bold">
                {patient.firstName} {patient.lastName}
              </div>
              <div className="space-y-2 text-sm">
                <div>{documentDisplay === "-" ? "" : documentDisplay}</div>
                <div>
                  {patient.dateOfBirth && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 font-sans text-xs font-medium text-sky-700">
                      {calculateAge(patient.dateOfBirth)} años
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Profesión</div>
                  <div>{patient.profession ?? ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Aseguradora</div>
                  <div>{insuranceName ?? ""}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-9">
            <CardHeader>
              <CardTitle className="text-base">Datos del paciente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Fecha de nacimiento</div>
                <div>{formatDateOnly(patient.dateOfBirth)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono</div>
                <div>{patient.phone}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono 2</div>
                <div>{patient.phone2 ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Email</div>
                <div>{patient.email ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Dirección</div>
                <div>{patient.address ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">C.P.</div>
                <div>{patient.postalCode ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ciudad/Población</div>
                <div>{patient.city ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Provincia</div>
                <div>{patient.province ?? ""}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Primera consulta</div>
                <div>
                  {patient.firstConsultationDate ? formatDateOnly(patient.firstConsultationDate) : ""}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
