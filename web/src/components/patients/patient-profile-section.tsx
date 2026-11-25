"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { PencilIcon, PlusIcon } from "@heroicons/react/24/outline";
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
import { PrintPatientRecordDialog } from "@/components/patients/print-patient-record-dialog";
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
  // El médico ve "Nueva consulta" en la acción principal de la cabecera;
  // recepción, que no crea consultas, ve "Nueva cita".
  canCreateClinicalEntries?: boolean;
  // Columna derecha (la ancha): Antecedentes, Consultas e Historia clínica,
  // que la página trae del servidor y aquí solo se colocan.
  children?: ReactNode;
}

const initialState: PatientFormState = {};

const CREATION_SOURCE_LABEL = {
  manual: "Manual",
  import: "Importación",
  whatsapp: "WhatsApp",
  unknown: "Desconocido",
} as const;

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50";

// Una fila "Etiqueta   valor" del bloque de datos: etiqueta en negrita a
// ancho fijo y valor en gris al lado, como una ficha en papel. El valor
// puede partir línea (direcciones, emails largos) sin empujar la etiqueta.
function InfoRow({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === undefined || children === null || children === "";
  return (
    <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] gap-x-3">
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="break-words text-muted-foreground">{empty ? "—" : children}</dd>
    </div>
  );
}

// Grupo de filas separado del anterior por una línea fina: datos
// personales / contacto / administrativos, para que la lista no sea un
// bloque continuo de quince filas iguales.
function InfoGroup({ children }: { children: ReactNode }) {
  return <dl className="space-y-2.5 border-t pt-4 first:border-t-0 first:pt-0">{children}</dl>;
}

// El error de campo (si lo hay) se pinta debajo con id `profile-<id>-error`,
// el que referencian aria-describedby y focusFirstFieldError.
function EditField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`profile-${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// Atributos de accesibilidad de un campo con posible error de servidor.
function errorProps(id: string, error?: string) {
  return {
    "aria-invalid": !!error,
    "aria-describedby": error ? `profile-${id}-error` : undefined,
  };
}

// Migas de pan + acciones (Editar/Imprimir/Cita) y la ficha a dos columnas:
// a la izquierda, estrecha, la tarjeta de identidad (foto o iniciales,
// nombre, nº de historia y edad) y debajo los datos del paciente; a la
// derecha, ancha, lo que pase la página como children. "Editar" no abre un
// modal: las dos tarjetas de la izquierda se quedan donde están y cada valor
// pasa a ser su campo, con Guardar/Cancelar debajo. Por debajo de lg todo se
// apila en una columna: identidad, datos y luego la columna derecha.
export function PatientProfileSection({
  patient,
  insuranceOptions,
  insuranceName,
  practitionerOptions,
  whatsappEnabled = false,
  canCreateClinicalEntries = false,
  children,
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

  const fullName = `${patient.firstName} ${patient.lastName}`;

  const avatar = (
    <div className="relative">
      <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="xl" />
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/patients" className="hover:text-foreground hover:underline">
            Pacientes
          </Link>
          <span>›</span>
          <span className="text-foreground">{fullName}</span>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <PrintPatientRecordDialog patientId={patient.id} />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              Editar
            </Button>
            {canCreateClinicalEntries ? (
              <Button asChild>
                <Link href={`/patients/${patient.id}/clinical-entries/new`}>
                  <PlusIcon data-icon="inline-start" />
                  Nueva consulta
                </Link>
              </Button>
            ) : (
              <CreateAppointmentDialog
                patientId={patient.id}
                patientName={fullName}
                practitioners={practitionerOptions}
              />
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
        {/* ── Columna izquierda ── */}
        {editing ? (
          <form
            ref={formRef}
            onSubmit={keepValuesOnSubmit(formAction)}
            onInputCapture={onInputCapture}
            onChangeCapture={onChangeCapture}
            onClickCapture={onClickCapture}
            className="space-y-4"
          >
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-2 text-center">
                {avatar}
                <div className="grid w-full grid-cols-2 gap-2 text-left">
                  <EditField id="firstName" error={state.fieldErrors?.firstName} label="Nombre">
                    <Input
                      id="firstName"
                      name="firstName"
                      defaultValue={patient.firstName}
                      required
                      disabled={pending}
                      {...errorProps("firstName", state.fieldErrors?.firstName)}
                    />
                  </EditField>
                  <EditField id="lastName" error={state.fieldErrors?.lastName} label="Apellidos">
                    <Input
                      id="lastName"
                      name="lastName"
                      defaultValue={patient.lastName}
                      required
                      disabled={pending}
                      {...errorProps("lastName", state.fieldErrors?.lastName)}
                    />
                  </EditField>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del paciente</CardTitle>
              </CardHeader>
              {/* Una columna dentro de la columna estrecha (lg+); cuando
                  todo se apila en tablet hay sitio para dos. */}
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <EditField id="documentId" error={state.fieldErrors?.documentId} label="Documento (DNI/NIE)">
                  <Input
                    id="documentId"
                    name="documentId"
                    defaultValue={patient.documentId ?? ""}
                    maxLength={20}
                    disabled={pending}
                    {...errorProps("documentId", state.fieldErrors?.documentId)}
                  />
                </EditField>
                <EditField id="dateOfBirth" error={state.fieldErrors?.dateOfBirth} label="Fecha de nacimiento">
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
                    {...errorProps("dateOfBirth", state.fieldErrors?.dateOfBirth)}
                  />
                </EditField>
                <EditField id="gender" label="Género">
                  <select
                    id="gender"
                    name="gender"
                    defaultValue={patient.gender ?? ""}
                    disabled={pending}
                    className={SELECT_CLASS}
                  >
                    <option value="">Sin indicar</option>
                    <option value="hombre">{PATIENT_GENDER_LABEL.hombre}</option>
                    <option value="mujer">{PATIENT_GENDER_LABEL.mujer}</option>
                  </select>
                </EditField>
                <EditField id="profession" label="Profesión">
                  <Input
                    id="profession"
                    name="profession"
                    defaultValue={patient.profession ?? ""}
                    disabled={pending}
                  />
                </EditField>
                <EditField id="phone" error={state.fieldErrors?.phone} label="Teléfono">
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={patient.phone ?? ""}
                    required={!!patient.phone}
                    disabled={pending}
                    {...errorProps("phone", state.fieldErrors?.phone)}
                  />
                </EditField>
                <EditField id="phone2" label="Teléfono 2">
                  <Input id="phone2" name="phone2" defaultValue={patient.phone2 ?? ""} disabled={pending} />
                </EditField>
                <EditField id="email" error={state.fieldErrors?.email} label="Email">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={patient.email ?? ""}
                    disabled={pending}
                    {...errorProps("email", state.fieldErrors?.email)}
                  />
                </EditField>
                <EditField id="address" label="Dirección">
                  <Input id="address" name="address" defaultValue={patient.address ?? ""} disabled={pending} />
                </EditField>
                <EditField id="postalCode" label="C.P.">
                  <Input
                    id="postalCode"
                    name="postalCode"
                    maxLength={10}
                    defaultValue={patient.postalCode ?? ""}
                    disabled={pending}
                  />
                </EditField>
                <EditField id="city" label="Ciudad/Población">
                  <Input id="city" name="city" defaultValue={patient.city ?? ""} disabled={pending} />
                </EditField>
                <EditField id="province" label="Provincia">
                  <Input id="province" name="province" defaultValue={patient.province ?? ""} disabled={pending} />
                </EditField>
                <EditField id="insuranceEntityId" label="Aseguradora">
                  <select
                    id="insuranceEntityId"
                    name="insuranceEntityId"
                    defaultValue={patient.insuranceEntityId ?? ""}
                    disabled={pending}
                    className={SELECT_CLASS}
                  >
                    <option value="">Sin especificar</option>
                    {insuranceOptions?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField id="insuranceNumber" label="Nº de seguro privado">
                  <Input
                    id="insuranceNumber"
                    name="insuranceNumber"
                    defaultValue={patient.insuranceNumber ?? ""}
                    maxLength={50}
                    disabled={pending}
                  />
                </EditField>
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
                <div className="sm:col-span-2 lg:col-span-1">
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

            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando..." : "Guardar cambios"}
              </Button>
              <Button type="button" data-ignore-dirty="true" variant="outline" onClick={cancelEditing} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-3 text-center">
                {avatar}
                <div className="space-y-1">
                  <h1 className="text-lg leading-tight font-bold">{fullName}</h1>
                  {patient.legacyId && (
                    <div className="text-sm text-muted-foreground">
                      Nº de historia:{" "}
                      <span className="font-medium text-foreground">{formatLegacyId(patient.legacyId)}</span>
                    </div>
                  )}
                </div>
                {patient.dateOfBirth && (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 font-sans text-xs font-medium text-sky-700">
                    {calculateAge(patient.dateOfBirth)} años
                  </span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del paciente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <InfoGroup>
                  <InfoRow label="Documento">
                    {documentDisplay !== "-"
                      ? documentDisplay
                      : patient.holder?.documentId
                        ? `${formatDocumentId(patient.holder.documentId)} (del titular)`
                        : null}
                  </InfoRow>
                  <InfoRow label="Nacimiento">
                    {patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : null}
                  </InfoRow>
                  <InfoRow label="Género">{patient.gender ? PATIENT_GENDER_LABEL[patient.gender] : null}</InfoRow>
                  <InfoRow label="Profesión">{patient.profession}</InfoRow>
                </InfoGroup>

                <InfoGroup>
                  <InfoRow label="Teléfono">{patient.phone}</InfoRow>
                  {patient.phone2 && <InfoRow label="Teléfono 2">{patient.phone2}</InfoRow>}
                  <InfoRow label="Email">
                    {patient.email && <span className="break-all">{patient.email}</span>}
                  </InfoRow>
                  <InfoRow label="Dirección">{patient.address}</InfoRow>
                  <InfoRow label="C.P.">{patient.postalCode}</InfoRow>
                  <InfoRow label="Ciudad">{patient.city}</InfoRow>
                  <InfoRow label="Provincia">{patient.province}</InfoRow>
                </InfoGroup>

                <InfoGroup>
                  <InfoRow label="Aseguradora">{insuranceName}</InfoRow>
                  <InfoRow label="Nº de seguro">{patient.insuranceNumber}</InfoRow>
                  <InfoRow label="Primera consulta">
                    {patient.firstConsultationDate ? formatDateOnly(patient.firstConsultationDate) : null}
                  </InfoRow>
                  {(whatsappEnabled || patient.creationSource !== "whatsapp") && (
                    <InfoRow label="Origen del alta">
                      {CREATION_SOURCE_LABEL[patient.creationSource ?? "unknown"]}
                    </InfoRow>
                  )}
                  {patient.holder && (
                    <InfoRow label="A cargo de">
                      <Link href={`/patients/${patient.holder.id}`} className="text-foreground hover:underline">
                        {patient.holder.firstName} {patient.holder.lastName}
                      </Link>
                      {patient.holderRelationship && (
                        <span className="block text-xs">
                          {HOLDER_RELATIONSHIP_LABEL[patient.holderRelationship]}
                        </span>
                      )}
                    </InfoRow>
                  )}
                  {patient.dependents && patient.dependents.length > 0 && (
                    <InfoRow label="Familiares a cargo">
                      <ul className="space-y-1">
                        {patient.dependents.map((d) => (
                          <li key={d.id}>
                            <Link href={`/patients/${d.id}`} className="text-foreground hover:underline">
                              {d.firstName} {d.lastName}
                            </Link>
                            {d.holderRelationship && (
                              <span className="block text-xs">{HOLDER_RELATIONSHIP_LABEL[d.holderRelationship]}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </InfoRow>
                  )}
                </InfoGroup>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Columna derecha ── */}
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </>
  );
}
