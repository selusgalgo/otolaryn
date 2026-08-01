import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

// A precomputed, valid Argon2id hash with no corresponding real password.
// Used to keep login's response time constant whether or not the email
// exists — otherwise the early-return on a missing user skips argon2.verify
// entirely, and the resulting timing gap lets an attacker enumerate which
// emails have accounts.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$+7KOsF6OrJzYUHGHwPKSDg$wXTqnTYdtvU7Qqlq9bFamlIayO4PfilyqW7ouUuEH60';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    // iam.users carries no RLS (see entity comment), so this lookup runs on
    // the plain pooled connection — there is no tenant context yet.
    const user = await this.users
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email })
      .getOne();

    // Always run argon2.verify, even for a nonexistent user, against the
    // dummy hash — so "no such user" and "wrong password" take the same
    // amount of time.
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenant_id: user.tenantId,
      role: user.role,
      first_name: user.firstName,
      last_name: user.lastName,
    });

    return { accessToken };
  }
}
