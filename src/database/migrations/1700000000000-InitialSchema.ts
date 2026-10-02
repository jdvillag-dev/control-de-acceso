import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    const audit = `created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`;
    await q.query(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      email varchar NOT NULL UNIQUE,
      password_hash varchar NOT NULL,
      role varchar NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('ADMIN','LEADER','EMPLOYEE')),
      active boolean NOT NULL DEFAULT true,
      ${audit})`);
    await q.query(`CREATE TABLE sites (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name varchar NOT NULL UNIQUE,
      address varchar,
      active boolean NOT NULL DEFAULT true,
      ${audit})`);
    await q.query(`CREATE TABLE employees (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      full_name varchar NOT NULL,
      document_number varchar NOT NULL UNIQUE,
      staff_type varchar NOT NULL DEFAULT 'INTRAMURAL' CHECK (staff_type IN ('INTRAMURAL','EXTRAMURAL')),
      active boolean NOT NULL DEFAULT true,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      ${audit})`);
    await q.query(`CREATE TABLE shift_templates (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name varchar NOT NULL,
      start_time varchar(5) NOT NULL,
      end_time varchar(5) NOT NULL,
      late_tolerance_minutes int NOT NULL DEFAULT 0,
      ${audit})`);
    await q.query(`CREATE TABLE shift_assignments (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      shift_template_id uuid NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
      start_date date NOT NULL,
      end_date date NOT NULL,
      ${audit},
      CHECK (end_date >= start_date))`);
    await q.query(`CREATE TABLE attendance_records (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      work_date date NOT NULL,
      check_in_at timestamptz NOT NULL,
      check_out_at timestamptz,
      source varchar NOT NULL DEFAULT 'ONLINE' CHECK (source IN ('ONLINE','OFFLINE_SYNC')),
      ${audit},
      CONSTRAINT uq_attendance_employee_day UNIQUE (employee_id, work_date))`);
    await q.query(
      `CREATE INDEX idx_assignments_employee ON shift_assignments (employee_id, start_date, end_date)`,
    );
    await q.query(`CREATE INDEX idx_employees_site ON employees (site_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of [
      'attendance_records',
      'shift_assignments',
      'shift_templates',
      'employees',
      'sites',
      'users',
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${t}`);
    }
  }
}
