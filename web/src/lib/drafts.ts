// Borradores locales (localStorage) de formularios con texto clínico largo.
// Todo acceso a localStorage va en try/catch: en modo privado, con el
// almacenamiento bloqueado o con la cuota llena lanza, y un fallo del
// autoguardado nunca debe tumbar la pantalla ni el guardado normal.

// Las claves llevan clínica y usuario (ver DraftScopeProvider): en un
// ordenador compartido, otro usuario no recupera ni ve el borrador ajeno.
const DRAFT_PREFIX = "mederi-draft:v2:";
// Claves de la versión anterior (sin usuario en la clave): se descartan, no se
// migran, porque no se sabe de quién eran.
const LEGACY_PREFIX = "clinical-entry-draft:";

export interface StoredDraft<T> {
  savedAt: number;
  fields: T;
}

export function buildDraftKey(scope: string, key: string): string {
  return `${DRAFT_PREFIX}${scope}:${key}`;
}

export function readDraft<T>(key: string, ttlMs: number): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed.savedAt || !parsed.fields || Date.now() - parsed.savedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    // Borrador corrupto o localStorage inaccesible — se trata como si no
    // hubiera borrador.
    return null;
  }
}

// false si no se pudo guardar (cuota llena, almacenamiento bloqueado): el
// llamador avisa a la persona en vez de dejarla creyendo que está a salvo.
export function writeDraft<T>(key: string, fields: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), fields }));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(key: string | undefined): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // nada que borrar si el almacenamiento no es accesible
  }
}

function removeWhere(predicate: (key: string, savedAt: number | null) => boolean): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(DRAFT_PREFIX) || key.startsWith(LEGACY_PREFIX))) keys.push(key);
    }
    for (const key of keys) {
      let savedAt: number | null = null;
      try {
        savedAt = (JSON.parse(localStorage.getItem(key) ?? "null") as StoredDraft<unknown> | null)?.savedAt ?? null;
      } catch {
        savedAt = null;
      }
      if (predicate(key, savedAt)) localStorage.removeItem(key);
    }
  } catch {
    // almacenamiento inaccesible
  }
}

// Al cerrar sesión de forma explícita: no dejar texto clínico en un
// ordenador que puede ser compartido.
export function clearAllDrafts(): void {
  removeWhere(() => true);
}

// Barrido al abrir un formulario: borradores caducados, corruptos o de la
// versión anterior de las claves.
export function purgeStaleDrafts(ttlMs: number): void {
  removeWhere((key, savedAt) => key.startsWith(LEGACY_PREFIX) || savedAt === null || Date.now() - savedAt > ttlMs);
}
