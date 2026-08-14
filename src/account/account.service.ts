import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../iam/entities/user.entity';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

const UNIQUE_VIOLATION = '23505';

export interface AccountProfile {
  firstName: string;
  lastName: string;
  username: string | null;
  email: string;
  role: string;
}

// "My own account" — deliberately not tenant-scoped (works identically for
// superadmin, who has none) and not RLS-gated (iam.users carries none, see
// User entity comment). Every method here is scoped to a single row by the
// caller's own id, taken from the JWT — never from the request body — so
// there's no risk of editing someone else's account regardless of role.
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async findSelf(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      // Can't actually happen for a valid JWT (the row it was issued for
      // still exists), but keeps this honest about its return type.
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.findSelf(userId);
    return toProfile(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AccountProfile> {
    const user = await this.findSelf(userId);
    user.firstName = dto.firstName;
    user.lastName = dto.lastName;
    if (dto.username !== undefined) {
      user.username = dto.username.trim() || null;
    }

    try {
      const saved = await this.users.save(user);
      return toProfile(saved);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException('That username is already taken');
      }
      throw err;
    }
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto): Promise<void> {
    const user = await this.findSelf(userId);

    const currentMatches = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.users.save(user);
  }
}

function toProfile(user: User): AccountProfile {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}
