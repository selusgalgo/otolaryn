type Choice = { id: string; title: string };
export type WhatsappMenu = {
  kind: 'main' | 'professionals' | 'slots' | 'dates' | 'confirm' | 'another';
  options: Choice[];
  hasMore?: boolean;
  hasPrevious?: boolean;
};

/** Converts only the menus produced by Mederi; invalid menus fall back to text. */
export function whatsappMetaPayload(
  phone: string,
  reply: string,
  menu?: WhatsappMenu,
): Record<string, unknown> {
  if (
    !/^[1-9]\d{7,14}$/.test(phone) ||
    !reply.trim() ||
    Array.from(reply).length > 4096
  )
    throw new Error('Respuesta de WhatsApp no válida');
  const base = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
  };
  const fallback = () => ({ ...base, type: 'text', text: { body: reply } });
  if (
    !menu ||
    !Array.isArray(menu.options) ||
    !menu.options.length ||
    Array.from(reply).length > 1024
  )
    return fallback();
  if (menu.kind === 'another') {
    if (
      menu.options.length !== 2 ||
      menu.options[0]?.id !== 'OTRA_MISMA' ||
      menu.options[1]?.id !== 'OTRA_PERSONA'
    )
      return fallback();
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: reply },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'OTRA_MISMA', title: 'Para mí' } },
            {
              type: 'reply',
              reply: { id: 'OTRA_PERSONA', title: 'Para otra persona' },
            },
          ],
        },
      },
    };
  }
  if (menu.kind === 'confirm') {
    if (
      menu.options.length !== 2 ||
      !/^CONFIRMAR:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i.test(
        menu.options[0]?.id,
      ) ||
      menu.options[1]?.id !== 'CANCELAR'
    )
      return fallback();
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: reply },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: menu.options[0].id, title: 'Confirmar cita' },
            },
            { type: 'reply', reply: { id: 'CANCELAR', title: 'Cancelar' } },
          ],
        },
      },
    };
  }
  if (menu.kind === 'main') {
    const labels: Record<string, string> = {
      CITA: 'Reservar cita',
      'CANCELAR CITA': 'Cancelar cita',
      'CAMBIAR CITA': 'Cambiar cita',
      RECEPCIÓN: 'Recepción',
    };
    if (
      menu.options.length > 4 ||
      new Set(menu.options.map((o) => o.id)).size !== menu.options.length ||
      menu.options.some((o) => !Object.hasOwn(labels, o.id))
    )
      return fallback();
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: reply },
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: '¿Qué necesitas?',
              rows: menu.options.map((o) => ({
                id: o.id,
                title: labels[o.id],
              })),
            },
          ],
        },
      },
    };
  }
  const patterns = {
    professionals: /^P:[0-9a-f-]{36}$/i,
    dates: /^D:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/i,
    slots: /^S:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i,
  };
  const pattern = patterns[menu.kind];
  if (
    !pattern ||
    menu.options.length > (menu.kind === 'professionals' ? 10 : 8)
  )
    return fallback();
  const rows: Choice[] = [];
  for (const option of menu.options) {
    if (
      typeof option.id !== 'string' ||
      !pattern.test(option.id) ||
      typeof option.title !== 'string' ||
      !option.title.trim()
    )
      return fallback();
    rows.push({
      id: option.id,
      title: Array.from(option.title).slice(0, 24).join(''),
    });
  }
  if (menu.kind === 'dates' && menu.hasPrevious)
    rows.push({ id: 'FECHASANTERIORES', title: 'Fechas anteriores' });
  if (menu.kind === 'dates' && menu.hasMore)
    rows.push({ id: 'MASFECHAS', title: 'Más fechas' });
  if (menu.kind === 'slots' && menu.hasMore)
    rows.push({ id: 'MAS', title: 'Más horarios' });
  if (menu.kind === 'slots') rows.push({ id: 'FECHA', title: 'Otra fecha' });
  if (rows.length > 10) return fallback();
  const label =
    menu.kind === 'professionals'
      ? 'profesional'
      : menu.kind === 'dates'
        ? 'fecha'
        : 'horario';
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: `Elige ${label === 'profesional' ? 'el' : label === 'fecha' ? 'una' : 'un'} ${label} disponible. Puedes escribir CANCELAR para salir.`,
      },
      action: {
        button:
          menu.kind === 'professionals'
            ? 'Ver profesionales'
            : menu.kind === 'dates'
              ? 'Ver fechas'
              : 'Ver horarios',
        sections: [
          {
            title:
              menu.kind === 'professionals'
                ? 'Profesionales'
                : menu.kind === 'dates'
                  ? 'Fechas disponibles'
                  : 'Horarios',
            rows,
          },
        ],
      },
    },
  };
}
