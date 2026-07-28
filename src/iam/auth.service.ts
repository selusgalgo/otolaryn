import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

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

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenant_id: user.tenantId,
      role: user.role,
    });

    return { accessToken };
  }
}
