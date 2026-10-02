import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { SitesModule } from './sites/sites.module';
import { EmployeesModule } from './employees/employees.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...dataSourceOptions(),
      migrations: [],
      synchronize: false,
    }),
    AuthModule,
    SitesModule,
    EmployeesModule,
    ShiftsModule,
    AttendanceModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
