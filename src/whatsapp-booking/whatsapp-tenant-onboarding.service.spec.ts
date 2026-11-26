import { ConfigService } from '@nestjs/config';
import { TenancyContext } from '../tenancy/tenancy-context';
import { MetaEmbeddedSignup } from './meta-embedded-signup';
import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';
import { WhatsappTenantOnboardingService } from './whatsapp-tenant-onboarding.service';

describe('WhatsappTenantOnboardingService', () => {
  it('vincula el inicio de registro a la clínica demo y al administrador', async () => {
    const tenantId = '2ad1bd62-a965-4b25-860f-120e50a30493';
    const query = jest.fn().mockResolvedValue([]);
    const values: Record<string, string> = {
      WHATSAPP_ONBOARDING_DEMO_TENANT_ID: tenantId,
      WHATSAPP_META_APP_ID: '123',
      WHATSAPP_META_CONFIG_ID: '456',
      WHATSAPP_META_APP_SECRET: 'secret',
      WHATSAPP_CREDENTIAL_KEY: 'ab'.repeat(32),
      WHATSAPP_ONBOARDING_DEMO_WABA_ID: '1',
      WHATSAPP_ONBOARDING_DEMO_PHONE_ID: '2',
    };
    const config = { get: (key: string) => values[key] } as ConfigService;
    const tenancy = {
      tenantId,
      manager: { query },
    } as unknown as TenancyContext;
    const service = new WhatsappTenantOnboardingService(config, tenancy);
    const result = await service.begin('e1d90341-6f74-4477-894d-0f147126b419');
    expect(result.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(query.mock.calls[0][1]).toEqual([
      tenantId,
      'e1d90341-6f74-4477-894d-0f147126b419',
      expect.not.stringContaining(result.state),
    ]);
    await expect(
      service.finish('e1d90341-6f74-4477-894d-0f147126b419', result.state, {
        code: 'c',
        wabaId: '1',
        phoneNumberId: '2',
      }),
    ).rejects.toThrow('caducado');
    values.WHATSAPP_ONBOARDING_DEMO_TENANT_ID =
      'f35ae750-eb8f-4e73-b7e4-d22888a38a02';
    await expect(
      service.begin('e1d90341-6f74-4477-894d-0f147126b419'),
    ).rejects.toThrow();
  });

  it('guarda solo una credencial validada, cifrada y pendiente para la clínica autenticada', async () => {
    const tenantId = '2ad1bd62-a965-4b25-860f-120e50a30493';
    const query = jest.fn().mockResolvedValue([]);
    const config = {
      get: (key: string) =>
        (
          ({
            WHATSAPP_META_APP_ID: '123',
            WHATSAPP_META_APP_SECRET: 'secret',
            WHATSAPP_CREDENTIAL_KEY: 'ab'.repeat(32),
          }) as Record<string, string>
        )[key],
    } as ConfigService;
    const tenancy = {
      tenantId,
      manager: { query },
    } as unknown as TenancyContext;
    const verify = jest
      .spyOn(MetaEmbeddedSignup.prototype, 'exchangeAndVerify')
      .mockResolvedValue('token-ficticio');
    try {
      const service = new WhatsappTenantOnboardingService(config, tenancy);
      await expect(
        service.completeVerifiedSignup({
          code: 'code',
          wabaId: '55',
          phoneNumberId: '77',
        }),
      ).resolves.toEqual({ status: 'pending' });
      const parameters = query.mock.calls[0][1] as string[];
      expect(parameters.slice(0, 3)).toEqual([tenantId, '55', '77']);
      expect(parameters[3]).not.toContain('token-ficticio');
      expect(
        new WhatsappCredentialCrypto('ab'.repeat(32)).decrypt(
          tenantId,
          parameters[3],
        ),
      ).toBe('token-ficticio');
    } finally {
      verify.mockRestore();
    }
  });

  it('suscribe solo la cuenta demo autorizada y espera confirmación antes de activarla', async () => {
    const tenantId = '2ad1bd62-a965-4b25-860f-120e50a30493';
    const key = 'ab'.repeat(32);
    const values: Record<string, string> = {
      WHATSAPP_ONBOARDING_DEMO_TENANT_ID: tenantId,
      WHATSAPP_ROUTER_DEMO_TENANT_ID: tenantId,
      WHATSAPP_ROUTER_ACTIVATION_ENABLED: 'true',
      WHATSAPP_ROUTER_DEMO_BINDINGS: '{}',
      WHATSAPP_ROUTER_TOKEN_SHA256: 'hash',
      WHATSAPP_ONBOARDING_DEMO_WABA_ID: '55',
      WHATSAPP_ONBOARDING_DEMO_PHONE_ID: '77',
      WHATSAPP_CREDENTIAL_KEY: key,
      WHATSAPP_META_APP_ID: '123',
      WHATSAPP_META_APP_SECRET: 'secret',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          waba_id: '55',
          phone_number_id: '77',
          encrypted_access_token: new WhatsappCredentialCrypto(key).encrypt(
            tenantId,
            'token',
          ),
          status: 'pending',
        },
      ])
      .mockResolvedValue([]);
    const service = new WhatsappTenantOnboardingService(
      { get: (k: string) => values[k] } as ConfigService,
      { tenantId, manager: { query } } as unknown as TenancyContext,
    );
    const check = jest
      .spyOn(MetaEmbeddedSignup.prototype, 'isSubscribed')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const subscribe = jest
      .spyOn(MetaEmbeddedSignup.prototype, 'subscribe')
      .mockResolvedValue();
    try {
      await expect(service.activate()).resolves.toEqual({ status: 'ready' });
      expect(subscribe).toHaveBeenCalledWith('55', 'token');
      expect(check).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toContain("status='ready'");
    } finally {
      check.mockRestore();
      subscribe.mockRestore();
    }
  });
});
