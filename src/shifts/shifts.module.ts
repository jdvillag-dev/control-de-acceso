import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Module,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { Repository } from 'typeorm';
import { Employee, ShiftAssignment, ShiftTemplate } from '../database/entities';
import { Role, Roles } from '../common/roles';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateShiftTemplateDto {
  @IsString()
  name: string;

  @Matches(HHMM, { message: 'startTime debe tener formato HH:mm' })
  startTime: string;

  @Matches(HHMM, { message: 'endTime debe tener formato HH:mm' })
  endTime: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateToleranceMinutes?: number;
}

export class CreateShiftAssignmentDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  shiftTemplateId: string;

  @Matches(DATE, { message: 'startDate debe tener formato YYYY-MM-DD' })
  startDate: string;

  @Matches(DATE, { message: 'endDate debe tener formato YYYY-MM-DD' })
  endDate: string;
}

@Controller('shifts')
export class ShiftsController {
  constructor(
    @InjectRepository(ShiftTemplate)
    private readonly templates: Repository<ShiftTemplate>,
    @InjectRepository(ShiftAssignment)
    private readonly assignments: Repository<ShiftAssignment>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
  ) {}

  @Roles(Role.ADMIN)
  @Post('templates')
  createTemplate(@Body() dto: CreateShiftTemplateDto) {
    return this.templates.save(this.templates.create(dto));
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get('templates')
  listTemplates() {
    return this.templates.find({ order: { name: 'ASC' } });
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Post('assignments')
  async assign(@Body() dto: CreateShiftAssignmentDto) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate debe ser >= startDate');
    }
    if (isNaN(Date.parse(dto.startDate)) || isNaN(Date.parse(dto.endDate))) {
      throw new BadRequestException('Fecha inválida');
    }
    if (!(await this.employees.exists({ where: { id: dto.employeeId } }))) {
      throw new NotFoundException('Empleado no encontrado');
    }
    if (!(await this.templates.exists({ where: { id: dto.shiftTemplateId } }))) {
      throw new NotFoundException('Turno no encontrado');
    }
    const overlap = await this.assignments
      .createQueryBuilder('a')
      .where(
        'a.employee_id = :e AND a.start_date <= :end AND a.end_date >= :start',
        {
          e: dto.employeeId,
          start: dto.startDate,
          end: dto.endDate,
        },
      )
      .getExists();
    if (overlap)
      throw new ConflictException(
        'El empleado ya tiene un turno asignado en ese rango',
      );
    return this.assignments.save(this.assignments.create(dto));
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get('assignments')
  listAssignments() {
    return this.assignments.find({ order: { startDate: 'DESC' } });
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([ShiftTemplate, ShiftAssignment, Employee]),
  ],
  controllers: [ShiftsController],
})
export class ShiftsModule {}
