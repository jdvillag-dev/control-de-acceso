import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee, User } from '../database/entities';
import { AuthController, AuthService } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Employee]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change_me',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
