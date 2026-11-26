"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppUser, WhatsappBookingSettings } from "@/lib/types";

const days = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function WhatsappFeaturesFields({
  settings,
  practitioners,
  pending,
}: {
  settings: WhatsappBookingSettings["features"];
  practitioners: AppUser[];
  pending: boolean;
}) {
  const [types, setTypes] = useState(settings.visitTypes);
  const [hours, setHours] = useState(
    settings.hours.map((range, index) => ({ ...range, id: String(index) })),
  );
  return (
    <>
      <fieldset disabled={pending} className="grid gap-3">
        <legend className="font-medium">Bienvenida y recepción</legend>
        <Label htmlFor="welcome">Saludo</Label>
        <Textarea
          id="welcome"
          name="welcome"
          maxLength={300}
          defaultValue={settings.welcome}
        />
        <Label htmlFor="receptionPhone">Teléfono de recepción</Label>
        <Input
          id="receptionPhone"
          name="receptionPhone"
          type="tel"
          maxLength={40}
          defaultValue={settings.receptionPhone}
        />
        <Label htmlFor="receptionHours">Horario de atención</Label>
        <Input
          id="receptionHours"
          name="receptionHours"
          maxLength={160}
          defaultValue={settings.receptionHours}
        />
      </fieldset>
      <fieldset disabled={pending} className="grid gap-3">
        <legend className="font-medium">Tipos de cita</legend>
        {types.map((type, index) => (
          <fieldset key={type.id} className="grid gap-2 rounded-md border p-3">
            <legend className="text-sm">Tipo de cita {index + 1}</legend>
            <input type="hidden" name="visitTypeId" value={type.id} />
            <Label htmlFor={`typeName-${type.id}`}>Nombre</Label>
            <Input
              id={`typeName-${type.id}`}
              name={`typeName-${type.id}`}
              required
              defaultValue={type.name}
              maxLength={60}
            />
            <Label htmlFor={`typeDuration-${type.id}`}>
              Duración (minutos)
            </Label>
            <Input
              id={`typeDuration-${type.id}`}
              name={`typeDuration-${type.id}`}
              type="number"
              min={5}
              max={480}
              required
              defaultValue={type.durationMinutes}
            />
            <span className="text-sm font-medium">Profesionales</span>
            {practitioners.map((p) => (
              <label key={p.id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`typePractitioner-${type.id}`}
                  value={p.id}
                  defaultChecked={type.practitionerIds.includes(p.id)}
                />
                {p.firstName} {p.lastName}
              </label>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() =>
                setTypes((rows) => rows.filter((row) => row.id !== type.id))
              }
            >
              Quitar tipo
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={types.length >= 8}
          onClick={() =>
            setTypes((rows) => [
              ...rows,
              {
                id: crypto.randomUUID(),
                name: "",
                durationMinutes: 30,
                practitionerIds: [],
              },
            ])
          }
        >
          Añadir tipo
        </Button>
      </fieldset>
      <fieldset disabled={pending} className="grid gap-3">
        <legend className="font-medium">Horarios de WhatsApp</legend>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="restrictHours"
            defaultChecked={settings.restrictHours}
          />{" "}
          Ofrecer solo estas franjas dentro de la agenda
        </label>
        {hours.map((range) => (
          <div className="grid gap-2 rounded-md border p-3" key={range.id}>
            <input type="hidden" name="rangeId" value={range.id} />
            <Label htmlFor={`weekday-${range.id}`}>Día</Label>
            <select
              id={`weekday-${range.id}`}
              name={`weekday-${range.id}`}
              defaultValue={range.weekday}
              className="rounded-md border bg-background p-2"
            >
              {days.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <Label htmlFor={`start-${range.id}`}>Inicio</Label>
            <Input
              id={`start-${range.id}`}
              name={`start-${range.id}`}
              type="time"
              required
              defaultValue={range.start}
            />
            <Label htmlFor={`end-${range.id}`}>Fin</Label>
            <Input
              id={`end-${range.id}`}
              name={`end-${range.id}`}
              type="time"
              required
              defaultValue={range.end}
            />
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() =>
                setHours((rows) => rows.filter((row) => row.id !== range.id))
              }
            >
              Quitar franja
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={hours.length >= 28}
          onClick={() =>
            setHours((rows) => [
              ...rows,
              {
                id: crypto.randomUUID(),
                weekday: 0,
                start: "09:00",
                end: "14:00",
              },
            ])
          }
        >
          Añadir franja
        </Button>
      </fieldset>
      <fieldset disabled={pending} className="grid gap-3">
        <legend className="font-medium">Cambios y avisos</legend>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="reschedule"
            defaultChecked={settings.reschedule}
          />{" "}
          Permitir cambiar citas por WhatsApp con el mismo plazo que para
          cancelar
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="notifyReception"
            defaultChecked={settings.notifyReception}
          />{" "}
          Mostrar avisos nuevos en la agenda de recepción
        </label>
        <Label htmlFor="reminderHours">
          Recordatorio al paciente (horas antes)
        </Label>
        <Input
          id="reminderHours"
          name="reminderHours"
          type="number"
          min={0}
          max={168}
          required
          defaultValue={settings.reminderHours}
        />
        <Label htmlFor="reminderTemplateName">Plantilla de Meta</Label>
        <Input
          id="reminderTemplateName"
          name="reminderTemplateName"
          maxLength={128}
          pattern="[a-z][a-z0-9_]{0,127}"
          defaultValue={settings.reminderTemplateName}
        />
        <Label htmlFor="reminderTemplateLanguage">Idioma de la plantilla</Label>
        <Input
          id="reminderTemplateLanguage"
          name="reminderTemplateLanguage"
          maxLength={6}
          pattern="[a-z]{2,3}(_[A-Z]{2})?"
          placeholder="es_ES"
          defaultValue={settings.reminderTemplateLanguage}
        />
        <p className="text-xs text-muted-foreground">
          Con 0 se desactiva. Configura el nombre e idioma de la plantilla de
          esta clínica en Meta y una conexión de WhatsApp activa. Sin esos datos
          no se enviarán recordatorios.
        </p>
      </fieldset>
    </>
  );
}
