import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Post,
  Query,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Employee, Site } from '../database/entities';
import { Role, Roles } from '../common/roles';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  documentNumber: string;

  @IsUUID()
  siteId: string;

  @IsOptional()
  @IsIn(['INTRAMURAL', 'EXTRAMURAL'])
  staffType?: 'INTRAMURAL' | 'EXTRAMURAL';
}

@Controller('employees')
export class EmployeesController {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
  ) {}

  @Roles(Role.ADMIN, Role.LEADER)
  @Post()
  async create(@Body() dto: CreateEmployeeDto) {
    if (!(await this.sites.exists({ where: { id: dto.siteId } }))) {
      throw new NotFoundException('Sede no encontrada');
    }
    if (
      await this.repo.exists({ where: { documentNumber: dto.documentNumber } })
    ) {
      throw new ConflictException('Documento ya registrado');
    }
    return this.repo.save(this.repo.create(dto));
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.repo.find({
      where: siteId ? { siteId } : {},
      order: { fullName: 'ASC' },
    });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Employee, Site])],
  controllers: [EmployeesController],
})
export class EmployeesModule {}
