import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { User } from '../iam/entities/user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';

const UNIQUE_VIOLATION = '23505';

// Cross-tenant on purpose, unlike every other service in this app: a
// superadmin has no tenantId to scope through (see User entity comment), so
// this never touches TenancyContext/TenantContextInterceptor — it talks to
// iam.tenants/iam.users directly via plain @InjectRepository, the same way
// AuthService does for login. Both tables carry no RLS, so there's nothing
// to bypass; there's just genuinely no tenant to set.
@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async listTenants(): Promise<Tenant[]> {
    return this.tenants.find({ order: { createdAt: 'DESC' } });
  }

  async createTenant(dto: CreateTenantDto): Promise<Tenant> {
    const passwordHash = await argon2.hash(dto.adminPassword, {
      type: argon2.argon2id,
    });

    // A tenant with no admin would be unusable, so both rows are created
    // together — if the admin insert fails (duplicate email), the tenant
    // insert rolls back with it rather than leaving an orphaned clinic.
    return this.dataSource.transaction(async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .save(manager.getRepository(Tenant).create({ name: dto.name }));

      try {
        await manager.getRepository(User).save(
          manager.getRepository(User).create({
            tenantId: tenant.id,
            email: dto.adminEmail,
            firstName: dto.adminFirstName,
            lastName: dto.adminLastName,
            role: 'admin',
            passwordHash,
          }),
        );
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err as { code?: string }).code === UNIQUE_VIOLATION
        ) {
          throw new ConflictException('A user with this email already exists');
        }
        throw err;
      }

      return tenant;
    });
  }
}
