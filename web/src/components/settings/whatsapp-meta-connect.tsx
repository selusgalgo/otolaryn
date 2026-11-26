"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  beginWhatsappConnection,
  completeWhatsappConnection,
} from "@/lib/actions/settings";

type Signup = { appId: string; configId: string; state: string };
type MetaSdk = {
  init: (options: { appId: string; version: string; xfbml: boolean }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: unknown,
  ) => void;
};
declare global {
  interface Window {
    FB?: MetaSdk;
  }
}

export function WhatsappMetaConnect() {
  const [setup, setSetup] = useState<Signup | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<{
    setup: Signup;
    code?: string;
    wabaId?: string;
    phoneNumberId?: string;
    sent: boolean;
  } | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const finish = () => {
      const current = active.current;
      if (
        !current ||
        current.sent ||
        !current.code ||
        !current.wabaId ||
        !current.phoneNumberId
      )
        return;
      current.sent = true;
      void completeWhatsappConnection({
        state: current.setup.state,
        code: current.code,
        wabaId: current.wabaId,
        phoneNumberId: current.phoneNumberId,
      })
        .then((result) => {
          if (timeout.current) clearTimeout(timeout.current);
          setWorking(false);
          setSetup(null);
          active.current = null;
          setMessage(
            result.error ??
              "Cuenta verificada. La conexión está pendiente de configurar y comprobar la recepción de mensajes.",
          );
        })
        .catch(() => {
          if (timeout.current) clearTimeout(timeout.current);
          setWorking(false);
          setSetup(null);
          active.current = null;
          setMessage(
            "Se ha interrumpido la respuesta. Comprueba el estado de la conexión antes de volver a intentarlo.",
          );
        });
    };
    const onMessage = (event: MessageEvent) => {
      if (
        ![
          "https://www.facebook.com",
          "https://web.facebook.com",
          "https://facebook.com",
        ].includes(event.origin) ||
        !active.current
      )
        return;
      let parsed: {
        type?: string;
        event?: string;
        data?: { waba_id?: unknown; phone_number_id?: unknown };
      };
      try {
        parsed =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (
        parsed?.type !== "WA_EMBEDDED_SIGNUP" ||
        !["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"].includes(
          parsed.event ?? "",
        )
      )
        return;
      if (
        typeof parsed.data?.waba_id !== "string" ||
        typeof parsed.data?.phone_number_id !== "string"
      )
        return;
      active.current.wabaId = parsed.data.waba_id;
      active.current.phoneNumberId = parsed.data.phone_number_id;
      finish();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const prepare = async () => {
    setWorking(true);
    setMessage("");
    let result: Awaited<ReturnType<typeof beginWhatsappConnection>>;
    try {
      result = await beginWhatsappConnection();
    } catch {
      setMessage("No se ha podido iniciar la conexión. Vuelve a intentarlo.");
      setWorking(false);
      return;
    }
    if (!result.appId || !result.configId || !result.state) {
      setMessage(result.error ?? "La conexión aún no está disponible.");
      setWorking(false);
      return;
    }
    try {
      if (!window.FB)
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://connect.facebook.net/es_ES/sdk.js";
          script.async = true;
          script.onload = () =>
            window.FB ? resolve() : reject(new Error("SDK no disponible"));
          script.onerror = () => reject(new Error("SDK no disponible"));
          document.head.appendChild(script);
        });
      window.FB!.init({ appId: result.appId, version: "v25.0", xfbml: false });
      setSetup({
        appId: result.appId,
        configId: result.configId,
        state: result.state,
      });
    } catch {
      setMessage("No se ha podido cargar Meta. Vuelve a intentarlo.");
    }
    setWorking(false);
  };

  const launch = () => {
    if (!setup || !window.FB) return;
    const current = { setup, sent: false } as NonNullable<
      typeof active.current
    >;
    active.current = current;
    setWorking(true);
    setMessage("");
    timeout.current = setTimeout(() => {
      if (active.current !== current || current.sent) return;
      active.current = null;
      setWorking(false);
      setSetup(null);
      setMessage("La conexión no se ha completado. Vuelve a intentarlo.");
    }, 300_000);
    window.FB.login(
      (response) => {
        if (active.current !== current) return;
        const code = response.authResponse?.code;
        if (!code) {
          if (timeout.current) clearTimeout(timeout.current);
          active.current = null;
          setWorking(false);
          setMessage("Se ha cancelado la conexión con Meta.");
          return;
        }
        current.code = code;
        // Meta can deliver the login response and the signup event in either order.
        if (current.wabaId && current.phoneNumberId && !current.sent) {
          current.sent = true;
          void completeWhatsappConnection({
            state: current.setup.state,
            code,
            wabaId: current.wabaId,
            phoneNumberId: current.phoneNumberId,
          })
            .then((result) => {
              if (timeout.current) clearTimeout(timeout.current);
              setWorking(false);
              setSetup(null);
              active.current = null;
              setMessage(
                result.error ??
                  "Cuenta verificada. La conexión está pendiente de configurar y comprobar la recepción de mensajes.",
              );
            })
            .catch(() => {
              if (timeout.current) clearTimeout(timeout.current);
              setWorking(false);
              setSetup(null);
              active.current = null;
              setMessage(
                "Se ha interrumpido la respuesta. Comprueba el estado de la conexión antes de volver a intentarlo.",
              );
            });
        }
      },
      {
        config_id: setup.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
          version: "v4",
        },
      },
    );
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Conecta una cuenta de empresa mediante Meta. La reserva se activará
        cuando termine la configuración y se compruebe la conexión.
      </p>
      {!setup ? (
        <Button
          type="button"
          className="w-fit"
          onClick={prepare}
          disabled={working}
        >
          {working ? "Preparando..." : "Preparar conexión"}
        </Button>
      ) : (
        <Button
          type="button"
          className="w-fit"
          onClick={launch}
          disabled={working}
        >
          {working ? "Conectando..." : "Continuar con Meta"}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
