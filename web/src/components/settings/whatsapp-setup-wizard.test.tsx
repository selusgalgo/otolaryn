import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WhatsappBookingSettings } from '@/lib/types';
import { WhatsappSetupWizard } from './whatsapp-setup-wizard';

vi.mock('./whatsapp-booking-form', () => ({
  WhatsappBookingForm: () => <label>Saludo<input aria-label="Saludo" /></label>,
}));
vi.mock('./whatsapp-meta-connect', () => ({ WhatsappMetaConnect: () => <p>Conectar con Meta</p> }));
vi.mock('./whatsapp-meta-check', () => ({ WhatsappMetaCheck: () => <p>Comprobación pendiente</p> }));

describe('WhatsappSetupWizard', () => {
  it('explica que Meta no está conectada y conserva la configuración al navegar', () => {
    render(<WhatsappSetupWizard action={vi.fn()} settings={{} as WhatsappBookingSettings} practitioners={[]} />);
    expect(screen.getByText('Conectar con Meta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar citas' }));
    fireEvent.change(screen.getByLabelText('Saludo'), { target: { value: 'Hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a la comprobación' }));
    expect(screen.getByText('Comprobación pendiente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la configuración' }));
    expect(screen.getByLabelText('Saludo')).toHaveValue('Hola');
  });
});
