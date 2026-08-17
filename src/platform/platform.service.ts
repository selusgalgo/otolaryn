import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { User } from '../iam/entities/user.entity';
import { UpdateScheduleDto } from '../settings/dto/update-schedule.dto';
import {
  assertNoOverlap,
  DaySchedule,
  defaultScheduleRows,
  groupByWeekday,
  toRows,
} from '../settings/schedule.util';
import { CreateTenantDto } from './dto/create-tenant.dto';
import type { CreateUserDto } from '../users/dto/create-user.dto';
import type { ResetPasswordDto } from '../users/dto/reset-password.dto';
import type { UpdateUserDto } from '../users/dto/update-user.dto';
import type { SafeUser } from '../users/users.service';

const UNIQUE_VIOLATION = '23505';

export interface TenantSchedule {
  tenantName: string;
  days: DaySchedule[];
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

// Cross-tenant on purpose, unlike every other service in this app: a
// superadmin has no tenantId to scope through (see User entity comment), so
// this never touches TenancyContext/TenantContextInterceptor — it talks to
// iam.tenants/iam.users/iam.clinic_hours directly via plain
// @InjectRepository, the same way AuthService does for login. None of
// those tables carry RLS, so there's nothing to bypass; there's just
// genuinely no tenant to set.
@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ClinicHour)
    private readonly clinicHours: Repository<ClinicHour>,
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

      // Same default the ClinicHoursSlots migration backfilled onto every
      // pre-existing tenant — without this, a brand-new clinic would show
      // up closed every day of the week until someone visits Configuración.
      await manager
        .getRepository(ClinicHour)
        .insert(defaultScheduleRows(tenant.id));

      return tenant;
    });
  }

  private async findTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  // Backs the clinic overview page (name + creation date header, above the
  // Pacientes/Usuarios sections) — findTenant() itself stays private since
  // every other caller already gets the tenant folded into a bigger
  // response (TenantSchedule, etc.).
  async getTenant(id: string): Promise<Tenant> {
    return this.findTenant(id);
  }

  async getSchedule(id: string): Promise<TenantSchedule> {
    const tenant = await this.findTenant(id);
    const rows = await this.clinicHours.find({ where: { tenantId: id } });
    return { tenantName: tenant.name, days: groupByWeekday(rows) };
  }

  async updateSchedule(
    id: string,
    dto: UpdateScheduleDto,
  ): Promise<TenantSchedule> {
    const tenant = await this.findTenant(id);
    assertNoOverlap(dto.days);

    await this.clinicHours.manager.transaction(async (manager) => {
      await manager.delete(ClinicHour, { tenantId: id });
      const rows = toRows(id, dto.days);
      if (rows.length > 0) {
        await manager.insert(ClinicHour, rows);
      }
    });

    const rows = await this.clinicHours.find({ where: { tenantId: id } });
    return { tenantName: tenant.name, days: groupByWeekday(rows) };
  }

  // --- Users, scoped to a clinic chosen by superadmin -----------------
  // Same "iam.users has no RLS, filter by tenantId explicitly" rule as
  // UsersService, just with the tenant coming from the route instead of
  // the caller's own JWT.

  async listUsers(tenantId: string): Promise<SafeUser[]> {
    await this.findTenant(tenantId);
    const users = await this.users.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return users.map(stripPasswordHash);
  }

  async createUser(tenantId: string, dto: CreateUserDto): Promise<SafeUser> {
    await this.findTenant(tenantId);
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = this.users.create({
      tenantId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      passwordHash,
    });

    try {
      const saved = await this.users.save(user);
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

  private async findUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<User> {
    const user = await this.users.findOne({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUser(
    tenantId: string,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<SafeUser> {
    const user = await this.findUserInTenant(tenantId, userId);
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.username !== undefined) user.username = dto.username || null;
    if (dto.role !== undefined) user.role = dto.role;

    try {
      const saved = await this.users.save(user);
      return stripPasswordHash(saved);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'A user with this email or username already exists',
        );
      }
      throw err;
    }
  }

  async resetPassword(
    tenantId: string,
    userId: string,
    dto: ResetPasswordDto,
  ): Promise<void> {
    const user = await this.findUserInTenant(tenantId, userId);
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.users.save(user);
  }
}
