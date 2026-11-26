"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkWhatsappConnection } from "@/lib/actions/settings";

export function WhatsappMetaCheck() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(
    "Comprueba la cuenta y después realiza una prueba de conversación.",
  );
  const check = async () => {
    setWorking(true);
    try {
      const result = await checkWhatsappConnection();
      if (result.error) setMessage(result.error);
      else if (result.status === "ready")
        setMessage(
          "Cuenta conectada y suscrita. Falta comprobar la entrega con una conversación de prueba.",
        );
      else if (result.status === "not_connected")
        setMessage(
          "Todavía no hay una cuenta conectada. Vuelve al primer paso.",
        );
      else
        setMessage(
          `La cuenta está guardada y pendiente de completar la conexión.${result.warning ? ` ${result.warning}` : ""}`,
        );
    } catch {
      setMessage("No se ha podido comprobar el estado. Vuelve a intentarlo.");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="grid gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={working}
        onClick={check}
      >
        {working ? "Comprobando..." : "Comprobar conexión"}
      </Button>
    </div>
  );
}
