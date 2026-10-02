import {
  BadRequestException,
  Controller,
  Get,
  Module,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceRecord,
  Employee,
  ShiftAssignment,
  Site,
} from '../database/entities';
import { Role, Roles } from '../common/roles';
import { localParts, toMinutes } from '../common/time';

export type DailyStatus = 'PRESENT' | 'LATE' | 'NO_MARK';

@Controller('reports')
export class ReportsController {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(ShiftAssignment)
    private readonly assignments: Repository<ShiftAssignment>,
    @InjectRepository(AttendanceRecord)
    private readonly records: Repository<AttendanceRecord>,
  ) {}

  @Roles(Role.ADMIN, Role.LEADER)
  @Get('daily-attendance')
  async daily(@Query('siteId') siteId: string, @Query('date') date: string) {
    if (!siteId) throw new BadRequestException('siteId es requerido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || isNaN(Date.parse(date))) {
      throw new BadRequestException('date es requerido con formato YYYY-MM-DD');
    }
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Sede no encontrada');

    const employees = await this.employees.find({
      where: { siteId, active: true },
      order: { fullName: 'ASC' },
    });
    const ids = employees.map((e) => e.id);
    const rows: any[] = [];
    if (ids.length) {
      const assignments = await this.assignments
        .createQueryBuilder('a')
        .innerJoinAndSelect('a.shiftTemplate', 't')
        .where(
          'a.employee_id IN (:...ids) AND a.start_date <= :date AND a.end_date >= :date',
          { ids, date },
        )
        .getMany();
      const records = await this.records
        .createQueryBuilder('r')
        .where('r.employee_id IN (:...ids) AND r.work_date = :date', {
          ids,
          date,
        })
        .getMany();

      for (const e of employees) {
        const shift = assignments.find(
          (a) => a.employeeId === e.id,
        )?.shiftTemplate;
        const rec = records.find((r) => r.employeeId === e.id);
        let status: DailyStatus = 'NO_MARK';
        let lateMinutes = 0;
        if (rec) {
          status = 'PRESENT';
          if (shift) {
            lateMinutes = Math.max(
              0,
              localParts(rec.checkInAt).minutes - toMinutes(shift.startTime),
            );
            if (lateMinutes > shift.lateToleranceMinutes) status = 'LATE';
            else lateMinutes = 0;
          }
        }
        rows.push({
          employeeId: e.id,
          fullName: e.fullName,
          shift: shift
            ? {
                name: shift.name,
                startTime: shift.startTime,
                endTime: shift.endTime,
              }
            : null,
          checkInAt: rec?.checkInAt ?? null,
          checkOutAt: rec?.checkOutAt ?? null,
          status,
          lateMinutes,
        });
      }
    }
    const count = (s: DailyStatus) => rows.filter((r) => r.status === s).length;
    return {
      site: { id: site.id, name: site.name },
      date,
      summary: {
        total: rows.length,
        present: count('PRESENT'),
        late: count('LATE'),
        noMark: count('NO_MARK'),
      },
      rows,
    };
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      Employee,
      ShiftAssignment,
      AttendanceRecord,
    ]),
  ],
  controllers: [ReportsController],
})
export class ReportsModule {}
