"use client";

import { createContext, useContext } from "react";

// "clínica:usuario" de la sesión actual. Lo fija (app)/layout a partir del
// JWT de la cookie, y los formularios con autoguardado lo meten en la clave
// del borrador: en un ordenador compartido, el borrador de una persona no
// aparece a otra. null = no se pudo determinar → sin autoguardado antes que
// uno que pueda mezclar personas.
const DraftScopeContext = createContext<string | null>(null);

export function DraftScopeProvider({ scope, children }: { scope: string | null; children: React.ReactNode }) {
  return <DraftScopeContext.Provider value={scope}>{children}</DraftScopeContext.Provider>;
}

export function useDraftScope(): string | null {
  return useContext(DraftScopeContext);
}
