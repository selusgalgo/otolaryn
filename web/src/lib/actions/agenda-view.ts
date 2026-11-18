'use server';

import { apiFetch } from '@/lib/api';

export type AgendaView = 'day' | 'week' | 'month';

export async function saveAgendaView(view: AgendaView): Promise<{ error?: string }> {
  if (!['day', 'week', 'month'].includes(view)) return { error: 'Vista no válida.' };
  try {
    await apiFetch('/account/agenda-view', { method: 'PATCH', body: { agendaView: view } });
    return {};
  } catch {
    return { error: 'No se ha podido guardar la vista. Inténtalo de nuevo.' };
  }
}
