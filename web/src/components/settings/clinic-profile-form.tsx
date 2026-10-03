"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClinicProfileFormState } from "@/lib/actions/settings";
import type { ClinicProfile } from "@/lib/types";

interface ClinicProfileFormProps {
  action: (
    prevState: ClinicProfileFormState,
    formData: FormData,
  ) => Promise<ClinicProfileFormState>;
  initialProfile: ClinicProfile;
}

const initialState: ClinicProfileFormState = {};

// name/address/phone/logo shown on every exported PDF (ficha de paciente,
// tratamiento) — see Configuración → Perfil de la clínica and
// clinic-header.util.ts on the backend. The logo preview is purely local
// state (FileReader → a data: URI) so a newly picked file shows immediately
// without a round-trip; the <input type="file"> itself still carries the
// real File the form submits.
export function ClinicProfileForm({ action, initialProfile }: ClinicProfileFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialProfile.logo);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRemoveLogo(false);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    setRemoveLogo(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la clínica</Label>
        <Input
          id="name"
          name="name"
          defaultValue={initialProfile.name}
          disabled={pending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tagline">Subtítulo</Label>
        <Input
          id="tagline"
          name="tagline"
          defaultValue={initialProfile.tagline ?? ""}
          disabled={pending}
          placeholder="p. ej. Otorrinolaringología — Cirugía de cara y cuello"
        />
        <p className="text-xs text-muted-foreground">
          Una frase corta debajo del nombre en la cabecera de los PDF exportados.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          name="address"
          defaultValue={initialProfile.address ?? ""}
          disabled={pending}
          placeholder="Calle, número, ciudad"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={initialProfile.phone ?? ""}
          disabled={pending}
          placeholder="954 000 000"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="logo">Logotipo</Label>
        {logoPreview && (
          // A data: URI (the stored logo or a freshly-picked file) isn't
          // something next/image's remote-loader pipeline applies to.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoPreview}
            alt="Logo de la clínica"
            className="h-16 w-auto rounded border bg-white object-contain p-1"
          />
        )}
        <div className="flex items-center gap-2">
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={pending}
            className="max-w-xs"
          />
          {logoPreview && (
            <Button type="button" variant="outline" onClick={handleRemoveLogo} disabled={pending}>
              Quitar
            </Button>
          )}
        </div>
        <input type="hidden" name="removeLogo" value={removeLogo ? "true" : "false"} />
        <p className="text-xs text-muted-foreground">PNG, JPEG o WebP, máx. 1 MB.</p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
