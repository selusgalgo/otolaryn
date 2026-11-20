import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsappMetaConnect } from './whatsapp-meta-connect';

const { begin, complete } = vi.hoisted(() => ({ begin: vi.fn(), complete: vi.fn() }));
vi.mock('@/lib/actions/settings', () => ({ beginWhatsappConnection: begin, completeWhatsappConnection: complete }));

describe('WhatsappMetaConnect', () => {
  afterEach(() => { delete window.FB; vi.clearAllMocks(); });
  it('solo combina el código con un evento de Meta y muestra la conexión pendiente', async () => {
    begin.mockResolvedValue({ appId: '123', configId: '456', state: 'state-demo' });
    complete.mockResolvedValue({ status: 'pending' });
    let callback: ((value: { authResponse?: { code?: string } }) => void) | undefined;
    window.FB = { init: vi.fn(), login: vi.fn((cb) => { callback = cb; }) };
    render(<WhatsappMetaConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar conexión' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Meta' }));
    const payload = JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '55', phone_number_id: '77' } });
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://facebook.com.example.org', data: payload }));
    callback!({ authResponse: { code: 'code-demo' } });
    expect(complete).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.facebook.com', data: payload }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith({ state: 'state-demo', code: 'code-demo', wabaId: '55', phoneNumberId: '77' }));
    expect(await screen.findByRole('status')).toHaveTextContent('pendiente');
  });
  it('acepta el evento de registro anterior al código una sola vez', async () => {
    begin.mockResolvedValue({ appId: '123', configId: '456', state: 'state-demo' });
    complete.mockResolvedValue({ status: 'pending' });
    let callback: ((value: { authResponse?: { code?: string } }) => void) | undefined;
    window.FB = { init: vi.fn(), login: vi.fn((cb) => { callback = cb; }) };
    render(<WhatsappMetaConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar conexión' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Meta' }));
    const event = new MessageEvent('message', { origin: 'https://www.facebook.com', data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '55', phone_number_id: '77' } }) });
    window.dispatchEvent(event);
    expect(complete).not.toHaveBeenCalled();
    callback!({ authResponse: { code: 'code-demo' } });
    window.dispatchEvent(event);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('pendiente');
  });
  it('permite reintentar si falla la preparación', async () => {
    begin.mockRejectedValueOnce(new Error('network'));
    render(<WhatsappMetaConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar conexión' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Vuelve a intentarlo');
    expect(screen.getByRole('button', { name: 'Preparar conexión' })).toBeEnabled();
  });
  it.each(['evento primero', 'código primero'])('avisa de resultado incierto si se pierde la respuesta: %s', async (order) => {
    begin.mockResolvedValue({ appId: '123', configId: '456', state: 'state-demo' });
    complete.mockRejectedValueOnce(new Error('network'));
    let callback: ((value: { authResponse?: { code?: string } }) => void) | undefined;
    window.FB = { init: vi.fn(), login: vi.fn((cb) => { callback = cb; }) };
    render(<WhatsappMetaConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar conexión' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Meta' }));
    const event = new MessageEvent('message', { origin: 'https://www.facebook.com', data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '55', phone_number_id: '77' } }) });
    if (order === 'evento primero') window.dispatchEvent(event);
    callback!({ authResponse: { code: 'code-demo' } });
    if (order === 'código primero') window.dispatchEvent(event);
    expect(await screen.findByRole('status')).toHaveTextContent('Comprueba el estado');
    expect(screen.getByRole('button', { name: 'Preparar conexión' })).toBeEnabled();
  });
});
