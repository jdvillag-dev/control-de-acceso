import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';

export const dataSourceOptions = () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'control_acceso',
  entities: ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});

export default new DataSource(dataSourceOptions());
