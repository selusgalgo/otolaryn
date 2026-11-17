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
  return /^(?:P:\d{1,2}:[^\r\n]{1,180}|S:[^\r\n]{1,100}|MAS|FECHA|CANCELAR)$/.test(selection)
    ? selection : '';
}

const truncate = (value, length) => Array.from(value).slice(0, length).join('');

function outbound(phone, reply) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone };
  const fallback = () => ({ ...base, type: 'text', text: { body: reply } });
  if (!/^[1-9]\d{7,14}$/.test(phone) || typeof reply !== 'string' || !reply.trim()) {
    throw new Error('Destinatario o respuesta no válidos');
  }
  const lines = reply.split('\n');
  const professionals = lines[0] === 'Para reservar una cita, elige profesional escribiendo el número:';
  const slots = lines[0] === 'Elige un horario escribiendo su número:';
  if (!professionals && !slots) return fallback();
  const numbered = lines.slice(1).filter((line) => /^\d+\. /.test(line));
  if (!numbered.length || numbered.length > (professionals ? 10 : 8)) return fallback();
  const rows = [];
  for (const [index, line] of numbered.entries()) {
    const match = /^(\d+)\. (.+)$/.exec(line);
    if (!match || Number(match[1]) !== index + 1) return fallback();
    const label = match[2];
    const id = professionals ? `P:${index + 1}:${label}` : `S:${label}`;
    if (Array.from(id).length > 180 || !label.trim()) return fallback();
    rows.push({ id, title: truncate(label, 24) });
  }
  if (slots && lines.includes('Escribe MAS para ver otros horarios.')) rows.push({ id: 'MAS', title: 'Más horarios' });
  if (slots && lines.includes('Escribe FECHA para elegir otro día.')) rows.push({ id: 'FECHA', title: 'Otra fecha' });
  if (rows.length > 10) return fallback();
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: professionals ? 'Elige el profesional para tu cita. Puedes escribir CANCELAR para salir.' : 'Elige un horario disponible. Puedes escribir CANCELAR para salir.' },
      action: { button: professionals ? 'Ver profesionales' : 'Ver horarios', sections: [{ title: professionals ? 'Profesionales' : 'Horarios', rows }] },
    },
  };
}

module.exports = { inboundText, outbound };
