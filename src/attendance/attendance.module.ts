import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Repository } from 'typeorm';
import { AttendanceRecord, Employee } from '../database/entities';
import { AuthUser, Role } from '../common/roles';
import { CurrentUser } from '../common/current-user';
import { localParts } from '../common/time';

type MarkType = 'CHECK_IN' | 'CHECK_OUT';
const MAX_FUTURE_MS = 5 * 60 * 1000;

export class MarkDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class OfflineMarkDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  type: MarkType;

  /** Hora original de la marcación (ISO 8601 con zona), capturada en el dispositivo. */
  @IsISO8601({ strict: true })
  timestamp: string;
}

export class SyncOfflineDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OfflineMarkDto)
  marks: OfflineMarkDto[];
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
  ) {}

  /** Un EMPLEADO solo puede marcar por sí mismo; ADMIN/LÍDER deben indicar employeeId. */
  resolveEmployeeId(user: AuthUser, requested?: string): string {
    if (user.role === Role.EMPLOYEE) {
      if (!user.employeeId)
        throw new ForbiddenException('Usuario sin colaborador asociado');
      if (requested && requested !== user.employeeId)
        throw new ForbiddenException();
      return user.employeeId;
    }
    if (!requested) throw new BadRequestException('employeeId es requerido');
    return requested;
  }

  async register(
    employeeId: string,
    type: MarkType,
    at: Date,
    source: AttendanceRecord['source'],
  ): Promise<AttendanceRecord> {
    if (at.getTime() > Date.now() + MAX_FUTURE_MS) {
      throw new BadRequestException('La marcación no puede estar en el futuro');
    }
    const employee = await this.employees.findOne({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    if (!employee.active)
      throw new ForbiddenException('Empleado inactivo o bloqueado');

    const workDate = localParts(at).date;
    const existing = await this.records.findOne({
      where: { employeeId, workDate },
    });

    if (type === 'CHECK_IN') {
      if (existing)
        throw new ConflictException(
          'Ya existe una entrada registrada para ese día',
        );
      try {
        return await this.records.save(
          this.records.create({ employeeId, workDate, checkInAt: at, source }),
        );
      } catch (e: any) {
        if (e?.code === '23505')
          throw new ConflictException(
            'Ya existe una entrada registrada para ese día',
          );
        throw e;
      }
    }

    if (!existing)
      throw new ConflictException('No hay entrada registrada para ese día');
    if (existing.checkOutAt)
      throw new ConflictException(
        'Ya existe una salida registrada para ese día',
      );
    if (at < existing.checkInAt)
      throw new BadRequestException('La salida es anterior a la entrada');
    existing.checkOutAt = at;
    return this.records.save(existing);
  }

  async syncOffline(user: AuthUser, dto: SyncOfflineDto) {
    const items = dto.marks
      .map((m, index) => ({ m, index }))
      .sort((a, b) => Date.parse(a.m.timestamp) - Date.parse(b.m.timestamp));
    const results: any[] = new Array(items.length);
    for (const { m, index } of items) {
      try {
        const employeeId = this.resolveEmployeeId(user, m.employeeId);
        const rec = await this.register(
          employeeId,
          m.type,
          new Date(m.timestamp),
          'OFFLINE_SYNC',
        );
        results[index] = { index, status: 'OK', recordId: rec.id };
      } catch (e: any) {
        results[index] = {
          index,
          status: 'ERROR',
          statusCode: e?.getStatus?.() ?? 500,
          message: e?.message ?? 'Error',
        };
      }
    }
    return {
      total: results.length,
      synced: results.filter((r) => r.status === 'OK').length,
      results,
    };
  }
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('checkin')
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: MarkDto) {
    return this.service.register(
      this.service.resolveEmployeeId(user, dto.employeeId),
      'CHECK_IN',
      new Date(),
      'ONLINE',
    );
  }

  @Post('checkout')
  checkOut(@CurrentUser() user: AuthUser, @Body() dto: MarkDto) {
    return this.service.register(
      this.service.resolveEmployeeId(user, dto.employeeId),
      'CHECK_OUT',
      new Date(),
      'ONLINE',
    );
  }

  @Post('sync-offline')
  @HttpCode(200)
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncOfflineDto) {
    return this.service.syncOffline(user, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceRecord, Employee])],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
