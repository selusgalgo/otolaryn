'use client';

import { useActionState } from 'react';
import { WhatsappFeaturesFields } from './whatsapp-features-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { keepValuesOnSubmit } from '@/lib/form-submit';
import type { AppUser, WhatsappBookingSettings } from '@/lib/types';

type State = { error?: string; success?: boolean };
type Action = (state: State, data: FormData) => Promise<State>;

export function WhatsappBookingForm({
  action,
  settings,
  practitioners,
}: {
  action: Action;
  settings: WhatsappBookingSettings;
  practitioners: AppUser[];
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form onSubmit={keepValuesOnSubmit(submit)} className="grid max-w-lg gap-4">
      <p className="text-sm text-muted-foreground">
        {settings.platformEnabled
          ? 'Habilitado por la plataforma.'
          : 'Pendiente de habilitación por la plataforma.'}
      </p>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          name="clinicEnabled"
          defaultChecked={settings.clinicEnabled}
          disabled={pending}
        />{' '}
        Permitir reservas por WhatsApp
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          name="askReason"
          defaultChecked={settings.askReason}
          disabled={pending}
        />{' '}
        Preguntar el motivo de la consulta
      </label>
      <div>
        <Label htmlFor="horizonDays">Ofrecer citas hasta (días)</Label>
        <Input
          id="horizonDays"
          name="horizonDays"
          type="number"
          min={1}
          max={90}
          defaultValue={settings.horizonDays}
          required
          disabled={pending}
        />
      </div>
      <div>
        <Label htmlFor="leadMinutes">Antelación mínima (minutos)</Label>
        <Input
          id="leadMinutes"
          name="leadMinutes"
          type="number"
          min={0}
          max={10080}
          defaultValue={settings.leadMinutes}
          required
          disabled={pending}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Profesionales disponibles
        </legend>
        <p className="text-xs text-muted-foreground">
          La conexión técnica también debe autorizar a los profesionales
          seleccionados.
        </p>
        {practitioners.map((p) => (
          <label key={p.id} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="practitionerIds"
              value={p.id}
              defaultChecked={settings.practitionerIds.includes(p.id)}
              disabled={pending}
            />{' '}
            {p.firstName} {p.lastName}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cancelaciones</legend>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="cancellationEnabled"
            defaultChecked={settings.cancellationEnabled}
            disabled={pending}
          />
          Permitir cancelar citas reservadas por WhatsApp
        </label>
        <Label htmlFor="cancellationNoticeHours">Antelación para cancelar (horas)</Label>
        <Input
          id="cancellationNoticeHours"
          name="cancellationNoticeHours"
          type="number"
          min={0}
          max={168}
          defaultValue={settings.cancellationNoticeHours}
          required
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Con 0 se puede cancelar hasta el inicio de la cita. Fuera de plazo, se indica al paciente que contacte con recepción.
        </p>
      </fieldset>
      <WhatsappFeaturesFields settings={settings.features} practitioners={practitioners} pending={pending} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Guardando...' : 'Guardar'}
      </Button>
    </form>
  );
}

export function WhatsappPlatformForm({
  action,
  enabled,
}: {
  action: Action;
  enabled: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form onSubmit={keepValuesOnSubmit(submit)} className="grid gap-4">
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          name="platformEnabled"
          defaultChecked={enabled}
          disabled={pending}
        />{' '}
        Habilitar reservas por WhatsApp para esta clínica
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Guardando...' : 'Guardar'}
      </Button>
    </form>
  );
}
