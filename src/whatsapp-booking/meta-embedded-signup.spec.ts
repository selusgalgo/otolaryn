import { MetaEmbeddedSignup } from './meta-embedded-signup';

describe('MetaEmbeddedSignup', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });
  it('acepta un número solo si Meta lo devuelve para la cuenta autorizada', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(json({ data: [{ id: '77' }] }));
    const service = new MetaEmbeddedSignup(
      '123',
      'test-secret',
      request as typeof fetch,
    );
    await expect(
      service.exchangeAndVerify('test-code', '55', '77'),
    ).resolves.toBe('test-token');
    expect(request.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer test-token',
    );
  });
  it('rechaza números ajenos y enlaces de paginación fuera de Meta', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(
        json({ data: [], paging: { next: 'https://example.com/steal' } }),
      );
    const service = new MetaEmbeddedSignup(
      '123',
      'test-secret',
      request as typeof fetch,
    );
    await expect(
      service.exchangeAndVerify('test-code', '55', '77'),
    ).rejects.toThrow('Respuesta de Meta no válida');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('comprueba la suscripción real de la aplicación sin modificar Meta', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        json({ data: [{ whatsapp_business_api_data: { id: '123' } }] }),
      );
    const service = new MetaEmbeddedSignup(
      '123',
      'test-secret',
      request as typeof fetch,
    );
    await expect(service.isSubscribed('55', 'test-token')).resolves.toBe(true);
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
  it('solicita la suscripción sin cambiar el webhook y exige confirmación de Meta', async () => {
    const request = jest.fn().mockResolvedValueOnce(json({ success: true }));
    const service = new MetaEmbeddedSignup(
      '123',
      'test-secret',
      request as typeof fetch,
    );
    await service.subscribe('55', 'test-token');
    expect(request).toHaveBeenCalledWith(
      'https://graph.facebook.com/v25.0/55/subscribed_apps',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
    expect(request.mock.calls[0][1].body).toBeUndefined();
  });
  it('no da por suscrita una respuesta que no confirma el resultado', async () => {
    const request = jest.fn().mockResolvedValueOnce(json({ success: false }));
    const service = new MetaEmbeddedSignup(
      '123',
      'test-secret',
      request as typeof fetch,
    );
    await expect(service.subscribe('55', 'test-token')).rejects.toThrow(
      'No se ha podido confirmar',
    );
  });
});
