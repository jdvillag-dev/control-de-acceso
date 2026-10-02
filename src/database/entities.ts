import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../common/roles';

abstract class Audited {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('users')
export class User extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', default: Role.EMPLOYEE })
  role: Role;

  @Column({ default: true })
  active: boolean;
}

@Entity('sites')
export class Site extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ default: true })
  active: boolean;
}

@Entity('employees')
export class Employee extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'document_number', unique: true })
  documentNumber: string;

  @Column({ name: 'staff_type', type: 'varchar', default: 'INTRAMURAL' })
  staffType: 'INTRAMURAL' | 'EXTRAMURAL';

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @ManyToOne(() => Site, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ name: 'user_id', type: 'uuid', nullable: true, unique: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}

@Entity('shift_templates')
export class ShiftTemplate extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'start_time', length: 5 })
  startTime: string;

  @Column({ name: 'end_time', length: 5 })
  endTime: string;

  @Column({ name: 'late_tolerance_minutes', type: 'int', default: 0 })
  lateToleranceMinutes: number;
}

@Entity('shift_assignments')
export class ShiftAssignment extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'shift_template_id', type: 'uuid' })
  shiftTemplateId: string;

  @ManyToOne(() => ShiftTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shift_template_id' })
  shiftTemplate: ShiftTemplate;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;
}

@Entity('attendance_records')
@Index(['employeeId', 'workDate'], { unique: true })
export class AttendanceRecord extends Audited {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ name: 'check_in_at', type: 'timestamptz' })
  checkInAt: Date;

  @Column({ name: 'check_out_at', type: 'timestamptz', nullable: true })
  checkOutAt: Date | null;

  @Column({ type: 'varchar', default: 'ONLINE' })
  source: 'ONLINE' | 'OFFLINE_SYNC';
}

export const ENTITIES = [
  User,
  Site,
  Employee,
  ShiftTemplate,
  ShiftAssignment,
  AttendanceRecord,
];
