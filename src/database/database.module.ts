import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { User } from '../iam/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Appointment } from '../patients/entities/appointment.entity';
import { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // Runtime app connection: authenticates as otolaryn_app, never the
      // schema-owning role used for migrations.
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.getOrThrow<string>('DB_APP_USER'),
        password: config.getOrThrow<string>('DB_APP_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        entities: [Tenant, User, Patient, Appointment, ClinicalEntry],
        synchronize: false,
        migrationsRun: false,
        extra: {
          max: config.get<number>('DB_POOL_MAX', 10),
        },
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
