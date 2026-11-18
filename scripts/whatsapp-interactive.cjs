'use strict';

// Pure transformations also used to prepare the corresponding n8n Code nodes.
// Unrecognised messages remain text; no option is inferred from free-form text.
function inboundText(message) {
  if (message?.type === 'text' && typeof message.text?.body === 'string') {
    return message.text.body.trim();
  }
  if (message?.type !== 'interactive') return '';
  const selection = message.interactive?.type === 'list_reply'
    ? message.interactive.list_reply?.id
    : message.interactive?.type === 'button_reply'
      ? message.interactive.button_reply?.id : undefined;
  if (typeof selection !== 'string' || selection.length > 200) return '';
  return /^(?:P:[0-9a-f-]{36}|S:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|D:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}|CONFIRMAR:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|FECHASANTERIORES|MASFECHAS|MAS|FECHA|CANCELAR|CITA|CANCELAR CITA|CAMBIAR CITA|RECEPCIÓN|OTRA_MISMA|OTRA_PERSONA)$/i.test(selection)
    ? selection : '';
}

const truncate = (value, length) => Array.from(value).slice(0, length).join('');

function outbound(phone, reply, menu) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone };
  const fallback = () => ({ ...base, type: 'text', text: { body: reply } });
  if (!/^[1-9]\d{7,14}$/.test(phone) || typeof reply !== 'string' || !reply.trim()) {
    throw new Error('Destinatario o respuesta no válidos');
  }
  if (menu?.kind === 'another') {
    if (menu.options?.length !== 2 || menu.options[0]?.id !== 'OTRA_MISMA' || menu.options[1]?.id !== 'OTRA_PERSONA' || Array.from(reply).length > 1024) return fallback();
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: reply }, action: { buttons: [
      { type: 'reply', reply: { id: 'OTRA_MISMA', title: 'Para mí' } },
      { type: 'reply', reply: { id: 'OTRA_PERSONA', title: 'Para otra persona' } },
    ] } } };
  }
  if (menu?.kind === 'main') {
    const labels = { CITA: 'Reservar cita', 'CANCELAR CITA': 'Cancelar cita', 'CAMBIAR CITA': 'Cambiar cita', 'RECEPCIÓN': 'Recepción' };
    if (!Array.isArray(menu.options) || menu.options.length < 1 || menu.options.length > 4 ||
        new Set(menu.options.map(option => option.id)).size !== menu.options.length ||
        menu.options.some(option => !Object.hasOwn(labels, option.id))) return fallback();
    return { ...base, type: 'interactive', interactive: {
      type: 'list', body: { text: reply }, action: { button: 'Ver opciones', sections: [{
        title: '¿Qué necesitas?', rows: menu.options.map(option => ({ id: option.id, title: labels[option.id] })),
      }] },
    } };
  }
  const professionals = menu?.kind === 'professionals';
  const slots = menu?.kind === 'slots';
  const dates = menu?.kind === 'dates';
  const confirm = menu?.kind === 'confirm';
  if (!professionals && !slots && !dates && !confirm) return fallback();
  if (!Array.isArray(menu.options) || !menu.options.length || menu.options.length > (professionals ? 10 : slots ? 8 : dates ? 8 : 2)) return fallback();
  if (confirm) {
    if (menu.options.length !== 2 || !/^CONFIRMAR:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i.test(menu.options[0]?.id) || menu.options[1]?.id !== 'CANCELAR' || Array.from(reply).length > 1024) return fallback();
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: reply }, action: { buttons: [
      { type: 'reply', reply: { id: menu.options[0].id, title: 'Confirmar cita' } },
      { type: 'reply', reply: { id: 'CANCELAR', title: 'Cancelar' } },
    ] } } };
  }
  const rows = [];
  for (const option of menu.options) {
    if (typeof option?.id !== 'string' || typeof option.title !== 'string' || !option.title.trim()) return fallback();
    if (professionals && !/^P:[0-9a-f-]{36}$/i.test(option.id)) return fallback();
    if (dates && !/^D:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/i.test(option.id)) return fallback();
    if (slots && !/^S:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i.test(option.id)) return fallback();
    rows.push({ id: option.id, title: truncate(option.title, 24) });
  }
  if (dates && menu.hasPrevious === true) rows.push({ id: 'FECHASANTERIORES', title: 'Fechas anteriores' });
  if (dates && menu.hasMore === true) rows.push({ id: 'MASFECHAS', title: 'Más fechas' });
  if (slots && menu.hasMore === true) rows.push({ id: 'MAS', title: 'Más horarios' });
  if (slots) rows.push({ id: 'FECHA', title: 'Otra fecha' });
  if (rows.length > 10) return fallback();
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: professionals ? 'Elige el profesional para tu cita. Puedes escribir CANCELAR para salir.' : dates ? 'Elige una fecha con horarios disponibles. Puedes escribir CANCELAR para salir.' : 'Elige un horario disponible. Puedes escribir CANCELAR para salir.' },
      action: { button: professionals ? 'Ver profesionales' : dates ? 'Ver fechas' : 'Ver horarios', sections: [{ title: professionals ? 'Profesionales' : dates ? 'Fechas disponibles' : 'Horarios', rows }] },
    },
  };
}

module.exports = { inboundText, outbound };
