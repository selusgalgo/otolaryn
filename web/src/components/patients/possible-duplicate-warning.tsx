"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { searchPatientsAction } from "@/lib/actions/patients";
import type { Patient } from "@/lib/types";
import { formatDateOnly, formatDocumentId } from "@/lib/utils";

interface IdentityValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  documentId: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function sameNameAndBirthDate(
  patient: Patient,
  values: IdentityValues,
): boolean {
  return (
    normalize(patient.firstName) === normalize(values.firstName) &&
    normalize(patient.lastName) === normalize(values.lastName) &&
    patient.dateOfBirth?.slice(0, 10) === values.dateOfBirth
  );
}

function sameDocument(patient: Patient, documentId: string): boolean {
  return Boolean(
    patient.documentId &&
    normalize(patient.documentId) === normalize(documentId),
  );
}

export function PossibleDuplicateWarning({
  values,
  excludePatientId,
}: {
  values: IdentityValues;
  excludePatientId?: string;
}) {
  const [matches, setMatches] = useState<Patient[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const documentId = values.documentId.trim();
    const hasDocument = normalize(documentId).length >= 5;
    const hasNameAndBirthDate =
      firstName.length >= 2 &&
      lastName.length >= 2 &&
      Boolean(values.dateOfBirth);

    if (!hasDocument && !hasNameAndBirthDate) {
      setMatches([]);
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);
    setMatches([]);
    const timer = setTimeout(() => {
      const queries = [
        ...(hasDocument ? [searchPatientsAction(documentId, 50)] : []),
        ...(hasNameAndBirthDate
          ? [searchPatientsAction(`${firstName} ${lastName}`, 50)]
          : []),
      ];
      Promise.all(queries.map((query) => query.catch(() => [])))
        .then((results) => {
          if (!active) return;
          const candidates = new Map(
            results.flat().map((patient) => [patient.id, patient]),
          );
          setMatches(
            [...candidates.values()].filter(
              (patient) =>
                patient.id !== excludePatientId &&
                ((hasDocument && sameDocument(patient, documentId)) ||
                  (hasNameAndBirthDate &&
                    sameNameAndBirthDate(patient, values))),
            ),
          );
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [values, excludePatientId]);

  if (checking) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Comprobando si ya existe este paciente…
      </p>
    );
  }
  if (!matches.length) return null;

  return (
    <section
      className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
      role="status"
    >
      <div>
        <p className="font-medium">
          Puede que este paciente ya esté registrado.
        </p>
        <p className="text-muted-foreground">
          Revisa estas fichas. Si no corresponde a la misma persona, puedes
          continuar con el alta.
        </p>
      </div>
      <ul className="divide-y">
        {matches.map((patient) => {
          const reason =
            values.documentId.trim() && sameDocument(patient, values.documentId)
              ? "Coincide el documento"
              : "Coinciden el nombre y la fecha de nacimiento";
          const contact = [
            patient.documentId ? formatDocumentId(patient.documentId) : null,
            patient.dateOfBirth
              ? `Nac. ${formatDateOnly(patient.dateOfBirth)}`
              : null,
            patient.phone ? `Tel. ${patient.phone}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={patient.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                <span className="block font-medium">
                  {patient.firstName} {patient.lastName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {reason}
                  {contact ? ` · ${contact}` : ""}
                </span>
              </span>
              <Link
                href={`/patients/${patient.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Revisar ficha
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
