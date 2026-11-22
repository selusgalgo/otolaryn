"use client";

import { useEffect } from "react";

/**
 * Marca el <body> con `data-hj-suppress` mientras el usuario está en la zona
 * autenticada de la clínica, para que Hotjar enmascare todo el texto que
 * muestra la app (nombres, historias clínicas, citas…).
 *
 * Hace falta en el <body> y no solo en un contenedor de página porque los
 * diálogos y desplegables (crear/editar paciente o cita, selector de
 * pacientes…) se pintan en portales fuera del árbol de la página.
 * Hotjar sigue registrando clics, scroll y la posición de los elementos;
 * solo sustituye el texto por asteriscos.
 */
export function HotjarSuppress() {
  useEffect(() => {
    document.body.setAttribute("data-hj-suppress", "");
    return () => document.body.removeAttribute("data-hj-suppress");
  }, []);

  return null;
}
