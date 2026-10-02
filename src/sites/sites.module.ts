import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Site } from '../database/entities';
import { Role, Roles } from '../common/roles';

export class CreateSiteDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  address?: string;
}

@Controller('sites')
export class SitesController {
  constructor(
    @InjectRepository(Site) private readonly repo: Repository<Site>,
  ) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.repo.save(
      this.repo.create({ name: dto.name, address: dto.address ?? null }),
    );
  }

  @Roles(Role.ADMIN, Role.LEADER)
  @Get()
  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [SitesController],
})
export class SitesModule {}
