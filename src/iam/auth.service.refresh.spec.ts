import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { CurrentUserPayload } from './current-user.decorator';

const user: CurrentUserPayload = {
  userId: 'u1',
  tenantId: 't1',
  role: 'profesional',
  firstName: 'Ana',
  lastName: 'Ruiz',
  agendaAccess: true,
  sessionEnd: 10_000,
};

function build() {
  const jwt = { signAsync: jest.fn().mockResolvedValue('nuevo-token') };
  const service = new AuthService(
    {} as never,
    {} as never,
    jwt as unknown as JwtService,
    new ConfigService({}),
  );
  return { service, jwt };
}

describe('AuthService.refresh', () => {
  it('emite un token nuevo conservando session_end', async () => {
    const { service, jwt } = build();
    await expect(service.refresh(user, 5_000)).resolves.toEqual({
      accessToken: 'nuevo-token',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', session_end: 10_000 }),
    );
  });

  it('rechaza con SESSION_EXPIRED al agotarse el techo absoluto', async () => {
    const { service, jwt } = build();
    await expect(service.refresh(user, 10_000)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
