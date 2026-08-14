import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import { User, UserRole } from '../iam/entities/user.entity';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreateUserDto } from './dto/create-user.dto';

const UNIQUE_VIOLATION = '23505';

export type SafeUser = Omit<User, 'passwordHash'>;

// iam.users carries no RLS (see User entity comment) — every query here
// must filter by tenant_id explicitly, the same way login itself does.
// Using tenancyContext.manager (not a plain @InjectRepository) anyway,
// since this still needs to run inside the request's transaction alongside
// everything else the interceptor sets up.
@Injectable()
export class UsersService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  private get repo() {
    return this.tenancyContext.manager.getRepository(User);
  }

  async findAll(role?: UserRole): Promise<SafeUser[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.tenantId = :tenantId', {
        tenantId: this.tenancyContext.tenantId,
      })
      .orderBy('u.createdAt', 'DESC');

    if (role) {
      qb.andWhere('u.role = :role', { role });
    }

    const users = await qb.getMany();
    return users.map(stripPasswordHash);
  }

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      passwordHash,
    });

    try {
      const saved = await this.repo.save(user);
      return stripPasswordHash(saved);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }
}

function stripPasswordHash(user: User): SafeUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt,
  };
}
