"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownTrayIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { updatePatientAction, type PatientFormState } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import { HolderPicker } from "@/components/patients/holder-picker";
import { HOLDER_RELATIONSHIP_LABEL, PATIENT_GENDER_LABEL, type Patient } from "@/lib/types";
import { calculateAge, formatDateOnly, formatDocumentId, formatLegacyId } from "@/lib/utils";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import { focusFirstFieldError } from "@/lib/form-errors";
import {
  confirmDiscardUnsavedChanges,
  useFormDirtyState,
  useUnsavedChangesWarning,
} from "@/lib/unsaved-changes";
import { toast } from "sonner";

interface PatientProfileSectionProps {
  patient: Patient;
  insuranceOptions?: InsuranceOption[];
  insuranceName?: string;
  practitionerOptions?: PractitionerOption[] | null;
  whatsappEnabled?: boolean;
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
  whatsappEnabled = false,
}: PatientProfileSectionProps) {
  const [editing, setEditing] = useState(false);
  // formatDocumentId returns "-" for a missing/placeholder document — blank
  // reads better than a lone dash for an empty field in this ficha.
  const documentDisplay = formatDocumentId(patient.documentId);
  const boundUpdate = updatePatientAction.bind(null, patient.id);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const {
    formRef,
    isDirty,
    dirtyRef,
    captureBaseline,
    onInputCapture,
    onChangeCapture,
    onClickCapture,
  } = useFormDirtyState();
  useUnsavedChangesWarning(editing && isDirty);

  useEffect(() => {
    if (editing) captureBaseline();
  }, [editing, captureBaseline]);

  useEffect(() => {
    if (state.success) {
      captureBaseline();
      toast.success("Datos del paciente guardados.");
      setEditing(false);
    }
  }, [state, captureBaseline]);

  useEffect(() => {
    focusFirstFieldError(formRef.current, state.fieldErrors);
  }, [state, formRef]);

  function cancelEditing() {
    if (!confirmDiscardUnsavedChanges(dirtyRef.current)) return;
    captureBaseline();
    setEditing(false);
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/patients/${patient.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <ArrowDownTrayIcon data-icon="inline-start" />
                Imprimir
              </a>
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              Editar
            </Button>
            <CreateAppointmentDialog
              patientId={patient.id}
              patientName={`${patient.firstName} ${patient.lastName}`}
              practitioners={practitionerOptions}
            />
          </div>
        )}
      </div>

      {editing ? (
        <form
          ref={formRef}
          onSubmit={keepValuesOnSubmit(formAction)}
          onInputCapture={onInputCapture}
          onChangeCapture={onChangeCapture}
          onClickCapture={onClickCapture}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Card className="md:col-span-3">
              <CardContent className="flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
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
                      aria-invalid={!!state.fieldErrors?.firstName}
                      aria-describedby={state.fieldErrors?.firstName ? "profile-firstName-error" : undefined}
                    />
                    {state.fieldErrors?.firstName && <p id="profile-firstName-error" className="text-xs text-destructive">{state.fieldErrors.firstName}</p>}
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
                      aria-invalid={!!state.fieldErrors?.lastName}
                      aria-describedby={state.fieldErrors?.lastName ? "profile-lastName-error" : undefined}
                    />
                    {state.fieldErrors?.lastName && <p id="profile-lastName-error" className="text-xs text-destructive">{state.fieldErrors.lastName}</p>}
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
                    aria-invalid={!!state.fieldErrors?.documentId}
                    aria-describedby={state.fieldErrors?.documentId ? "profile-documentId-error" : undefined}
                  />
                  {state.fieldErrors?.documentId && <p id="profile-documentId-error" className="text-xs text-destructive">{state.fieldErrors.documentId}</p>}
                </div>
                <div className="w-full space-y-1 text-left">
                  <Label htmlFor="gender" className="text-xs">
                    Género
                  </Label>
                  <select
                    id="gender"
                    name="gender"
                    defaultValue={patient.gender ?? ""}
                    disabled={pending}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
                  >
                    <option value="">Sin indicar</option>
                    <option value="hombre">{PATIENT_GENDER_LABEL.hombre}</option>
                    <option value="mujer">{PATIENT_GENDER_LABEL.mujer}</option>
                  </select>
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
                <div className="w-full space-y-1 text-left">
                  <Label htmlFor="insuranceNumber" className="text-xs">
                    Nº de seguro privado
                  </Label>
                  <Input
                    id="insuranceNumber"
                    name="insuranceNumber"
                    defaultValue={patient.insuranceNumber ?? ""}
                    maxLength={50}
                    disabled={pending}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-9">
              <CardHeader>
                <CardTitle className="text-base">Datos del paciente</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="dateOfBirth" className="text-xs text-muted-foreground">
                    Fecha de nacimiento
                  </Label>
                  <Input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    defaultValue={patient.dateOfBirth?.slice(0, 10)}
                    // Obligatorio solo si el paciente ya la tiene: así no se
                    // puede borrar, pero un paciente importado sin fecha se
                    // puede editar sin tener que inventarla.
                    required={!!patient.dateOfBirth}
                    disabled={pending}
                    aria-invalid={!!state.fieldErrors?.dateOfBirth}
                    aria-describedby={state.fieldErrors?.dateOfBirth ? "profile-dateOfBirth-error" : undefined}
                  />
                  {state.fieldErrors?.dateOfBirth && <p id="profile-dateOfBirth-error" className="text-xs text-destructive">{state.fieldErrors.dateOfBirth}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs text-muted-foreground">
                    Teléfono
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={patient.phone ?? ""}
                    required={!!patient.phone}
                    disabled={pending}
                    aria-invalid={!!state.fieldErrors?.phone}
                    aria-describedby={state.fieldErrors?.phone ? "profile-phone-error" : undefined}
                  />
                  {state.fieldErrors?.phone && <p id="profile-phone-error" className="text-xs text-destructive">{state.fieldErrors.phone}</p>}
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
                    aria-invalid={!!state.fieldErrors?.email}
                    aria-describedby={state.fieldErrors?.email ? "profile-email-error" : undefined}
                  />
                  {state.fieldErrors?.email && <p id="profile-email-error" className="text-xs text-destructive">{state.fieldErrors.email}</p>}
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
                  <Label htmlFor="firstConsultationOverride" className="text-xs text-muted-foreground">
                    Primera consulta
                  </Label>
                  {/* Sigue calculándose sola desde Historia clínica cuando
                      hay una consulta registrada — este campo es solo para
                      cubrir el caso contrario (una primera visita real que
                      nunca se registró como consulta). Vacío aquí no borra
                      una fecha calculada, solo dice "no hay nada que anular". */}
                  <Input
                    id="firstConsultationOverride"
                    name="firstConsultationOverride"
                    type="date"
                    defaultValue={patient.firstConsultationOverride ?? ""}
                    disabled={pending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Solo si la primera consulta no se registró en Historia clínica.
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <HolderPicker
                    patientId={patient.id}
                    initialHolder={patient.holder ?? null}
                    initialRelationship={patient.holderRelationship}
                    hasDependents={(patient.dependents?.length ?? 0) > 0}
                    disabled={pending}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              data-ignore-dirty="true"
              variant="outline"
              onClick={cancelEditing}
              disabled={pending}
            >
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
              </div>
              <div>
                <div className="text-lg font-bold">
                  {patient.firstName} {patient.lastName}
                </div>
                {patient.legacyId && (
                  <div className="text-xs text-muted-foreground">
                    Nº de historia: {formatLegacyId(patient.legacyId)}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {(whatsappEnabled || patient.creationSource !== "whatsapp") && <div>
                  <div className="text-xs text-muted-foreground">Origen del alta</div>
                  <div>{{ manual: "Manual", import: "Importación", whatsapp: "WhatsApp", unknown: "Desconocido" }[patient.creationSource ?? "unknown"]}</div>
                </div>}
                <div>
                  {documentDisplay !== "-"
                    ? documentDisplay
                    : patient.holder?.documentId
                      ? `${formatDocumentId(patient.holder.documentId)} (del titular)`
                      : ""}
                </div>
                <div>
                  {patient.dateOfBirth && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 font-sans text-xs font-medium text-sky-700">
                      {calculateAge(patient.dateOfBirth)} años
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Género</div>
                  <div>{patient.gender ? PATIENT_GENDER_LABEL[patient.gender] : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Profesión</div>
                  <div>{patient.profession || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Aseguradora</div>
                  <div>{insuranceName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Nº de seguro privado</div>
                  <div>{patient.insuranceNumber || "—"}</div>
                </div>
                {patient.holder && (
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Familiar a cargo de
                      {patient.holderRelationship && ` (${HOLDER_RELATIONSHIP_LABEL[patient.holderRelationship]})`}
                    </div>
                    <Link href={`/patients/${patient.holder.id}`} className="hover:underline">
                      {patient.holder.firstName} {patient.holder.lastName}
                    </Link>
                  </div>
                )}
                {patient.dependents && patient.dependents.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground">Familiares a cargo</div>
                    <ul className="space-y-0.5">
                      {patient.dependents.map((d) => (
                        <li key={d.id}>
                          <Link href={`/patients/${d.id}`} className="hover:underline">
                            {d.firstName} {d.lastName}
                          </Link>
                          {d.holderRelationship && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · {HOLDER_RELATIONSHIP_LABEL[d.holderRelationship]}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-9">
            <CardHeader>
              <CardTitle className="text-base">Datos del paciente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-muted-foreground">Fecha de nacimiento</div>
                <div>{formatDateOnly(patient.dateOfBirth)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono</div>
                <div>{patient.phone || "-"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Teléfono 2</div>
                <div>{patient.phone2 || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Email</div>
                <div>{patient.email || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Dirección</div>
                <div>{patient.address || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">C.P.</div>
                <div>{patient.postalCode || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Ciudad/Población</div>
                <div>{patient.city || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Provincia</div>
                <div>{patient.province || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Primera consulta</div>
                <div>
                  {patient.firstConsultationDate ? formatDateOnly(patient.firstConsultationDate) : "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
