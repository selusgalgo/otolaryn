/** Meta's Embedded Signup code is exchanged and inspected on the server only. */
export class MetaEmbeddedSignup {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!/^\d{1,30}$/.test(appId) || !appSecret)
      throw new Error('Configuración de Meta incompleta');
  }

  async isSubscribed(wabaId: string, token: string): Promise<boolean> {
    if (!/^\d{1,30}$/.test(wabaId) || !token)
      throw new Error('Cuenta no válida');
    const response = await this.request(
      `https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => {
      throw new Error('No se ha podido contactar con Meta');
    });
    if (!response.ok)
      throw new Error('No se ha podido verificar la suscripción de Meta');
    const body: unknown = await response.json().catch(() => {
      throw new Error('Respuesta de Meta no válida');
    });
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) throw new Error('Respuesta de Meta no válida');
    return data.some((item: unknown) => {
      const app = item as {
        id?: unknown;
        whatsapp_business_api_data?: { id?: unknown };
      } | null;
      return (
        app?.id === this.appId ||
        app?.whatsapp_business_api_data?.id === this.appId
      );
    });
  }

  /** Subscribe only the app associated with this token; no callback override. */
  async subscribe(wabaId: string, token: string): Promise<void> {
    if (!/^\d{1,30}$/.test(wabaId) || !token)
      throw new Error('Cuenta no válida');
    const response = await this.request(
      `https://graph.facebook.com/v25.0/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => {
      throw new Error('No se ha podido confirmar la suscripción de Meta');
    });
    if (!response.ok)
      throw new Error('No se ha podido suscribir la aplicación en Meta');
    const body: unknown = await response.json().catch(() => {
      throw new Error('Respuesta de Meta no válida');
    });
    if (
      (body as { success?: unknown })?.success !== true &&
      (body as { success?: unknown })?.success !== 'true'
    ) {
      throw new Error('No se ha podido confirmar la suscripción de Meta');
    }
  }

  async exchangeAndVerify(
    code: string,
    wabaId: string,
    phoneId: string,
  ): Promise<string> {
    if (
      !code ||
      code.length > 4096 ||
      !/^\d{1,30}$/.test(wabaId) ||
      !/^\d{1,30}$/.test(phoneId)
    ) {
      throw new Error('Respuesta de registro no válida');
    }
    // Never include Meta's response or credentials in errors or logs.
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: '',
      code,
    });
    const exchange = await this.request(
      `https://graph.facebook.com/v25.0/oauth/access_token?${params}`,
      { signal: AbortSignal.timeout(10_000) },
    ).catch(() => {
      throw new Error('No se ha podido contactar con Meta');
    });
    if (!exchange.ok)
      throw new Error('No se ha podido completar la conexión con Meta');
    const result: unknown = await exchange.json().catch(() => {
      throw new Error('Respuesta de Meta no válida');
    });
    const token = (result as { access_token?: unknown })?.access_token;
    if (typeof token !== 'string' || !token || token.length > 8192)
      throw new Error('Respuesta de Meta no válida');

    // The access token, not the browser's postMessage, must authorize this WABA
    // and prove that the selected number belongs to it. Bound paging and host.
    let url: string | undefined =
      `https://graph.facebook.com/v25.0/${wabaId}/phone_numbers?fields=id&limit=100`;
    for (let page = 0; page < 10 && url; page++) {
      const parsed = new URL(url);
      if (
        parsed.origin !== 'https://graph.facebook.com' ||
        parsed.pathname !== `/v25.0/${wabaId}/phone_numbers`
      )
        throw new Error('Respuesta de Meta no válida');
      parsed.searchParams.delete('access_token');
      const response = await this.request(parsed.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {
        throw new Error('No se ha podido contactar con Meta');
      });
      if (!response.ok)
        throw new Error('No se ha podido verificar la cuenta de WhatsApp');
      const body: unknown = await response.json().catch(() => {
        throw new Error('Respuesta de Meta no válida');
      });
      const data = (body as { data?: unknown })?.data;
      if (!Array.isArray(data)) throw new Error('Respuesta de Meta no válida');
      if (
        data.some((item: unknown) => (item as { id?: unknown })?.id === phoneId)
      )
        return token;
      const next = (body as { paging?: { next?: unknown } })?.paging?.next;
      if (next !== undefined && typeof next !== 'string')
        throw new Error('Respuesta de Meta no válida');
      url = next as string | undefined;
    }
    throw new Error('El número no pertenece a la cuenta autorizada');
  }
}
