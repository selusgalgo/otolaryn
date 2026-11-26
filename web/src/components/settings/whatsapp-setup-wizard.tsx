"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WhatsappBookingForm } from "./whatsapp-booking-form";
import { WhatsappMetaConnect } from "./whatsapp-meta-connect";
import { WhatsappMetaCheck } from "./whatsapp-meta-check";
import type { AppUser, WhatsappBookingSettings } from "@/lib/types";

type Action = (
  state: { error?: string; success?: boolean },
  data: FormData,
) => Promise<{ error?: string; success?: boolean }>;

/** Configuration is available independently of a verified Meta connection. */
export function WhatsappSetupWizard({
  action,
  settings,
  practitioners,
}: {
  action: Action;
  settings: WhatsappBookingSettings;
  practitioners: AppUser[];
}) {
  const [step, setStep] = useState(0);
  const steps = ["Conexión", "Configurar citas", "Comprobar"];
  return (
    <div className="grid gap-6">
      <nav aria-label="Pasos de configuración de WhatsApp">
        <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {steps.map((label, index) => (
            <li key={label} aria-current={index === step ? "step" : undefined}>
              <button
                type="button"
                className={
                  index === step ? "font-semibold" : "text-muted-foreground"
                }
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {step === 0 && (
        <section
          className="grid gap-3"
          aria-labelledby="whatsapp-connect-title"
        >
          <h3 id="whatsapp-connect-title" className="font-medium">
            Conecta el WhatsApp de tu empresa
          </h3>
          <WhatsappMetaConnect />
          <p className="text-sm">
            Puedes preparar las reglas de citas mientras se completa la
            conexión.
          </p>
          <Button type="button" className="w-fit" onClick={() => setStep(1)}>
            Configurar citas
          </Button>
        </section>
      )}
      <div hidden={step !== 1}>
        <WhatsappBookingForm
          action={action}
          settings={settings}
          practitioners={practitioners}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => setStep(2)}
        >
          Continuar a la comprobación
        </Button>
      </div>
      {step === 2 && (
        <section className="grid gap-3" aria-labelledby="whatsapp-check-title">
          <h3 id="whatsapp-check-title" className="font-medium">
            Comprueba la conexión
          </h3>
          <WhatsappMetaCheck />
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setStep(1)}
          >
            Volver a la configuración
          </Button>
        </section>
      )}
    </div>
  );
}
