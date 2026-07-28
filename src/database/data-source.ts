import 'dotenv/config';
import { DataSource } from 'typeorm';

// Used exclusively by the TypeORM migration CLI (and the seed script, which
// needs the same owner-level access). Connects as the schema owner, never
// as the runtime app role.
const migrationDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_OWNER_USER,
  password: process.env.DB_OWNER_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

export default migrationDataSource;
