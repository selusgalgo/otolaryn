'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { keepValuesOnSubmit } from '@/lib/form-submit';
import {
  saveBackupConfigurationAction,
  type BackupConfigurationState,
} from '@/lib/actions/backups';

const initialState: BackupConfigurationState = {};

export function BackupConfigurationForm({
  bucket,
  region,
}: {
  bucket: string | null;
  region: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveBackupConfigurationAction,
    initialState,
  );
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.success) setFormKey((value) => value + 1);
  }, [state]);
  return (
    <form
      key={formKey}
      onSubmit={keepValuesOnSubmit(action)}
      className="grid max-w-xl gap-4"
    >
      <div className="space-y-2">
        <Label htmlFor="backup-bucket">Nombre del bucket</Label>
        <Input
          id="backup-bucket"
          name="bucket"
          required
          maxLength={50}
          defaultValue={bucket ?? ''}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="backup-region">Región</Label>
        <Input
          id="backup-region"
          name="region"
          required
          maxLength={40}
          placeholder="eu-central-003"
          defaultValue={region ?? ''}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="backup-key-id">ID de clave de aplicación</Label>
        <Input
          id="backup-key-id"
          name="keyId"
          type="password"
          autoComplete="new-password"
          required
          maxLength={256}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="backup-key">Clave de aplicación</Label>
        <Input
          id="backup-key"
          name="applicationKey"
          type="password"
          autoComplete="new-password"
          required
          maxLength={256}
          disabled={pending}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Las claves se guardan cifradas y no vuelven a mostrarse. Para cambiar la
        configuración, introduce ambas de nuevo.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Comprobando…' : 'Comprobar y guardar'}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="text-sm">
            Configuración guardada.
          </p>
        )}
      </div>
    </form>
  );
}
