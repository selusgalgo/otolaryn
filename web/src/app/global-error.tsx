"use client";

import { useEffect } from "react";

// Último recurso: sustituye al layout raíz, así que no puede apoyarse en
// globals.css ni en los componentes de la app (estilos en línea).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f7fb",
          color: "#111827",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Algo no ha ido bien</h1>
        <p style={{ maxWidth: 420, fontSize: 14, margin: 0, color: "#4b5563" }}>
          Ha ocurrido un error inesperado. Los borradores de consulta siguen guardados en este dispositivo.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 999, border: 0, background: "#0022B0", color: "#fff", cursor: "pointer" }}
          >
            Reintentar
          </button>
          <a
            href="/session/expired?reason=SESSION_EXPIRED"
            style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid #d1d5db", color: "#111827", textDecoration: "none" }}
          >
            Iniciar sesión de nuevo
          </a>
        </div>
      </body>
    </html>
  );
}
