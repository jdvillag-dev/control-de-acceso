import {
  Body,
  Controller,
  HttpCode,
  Injectable,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Employee, User } from '../database/entities';
import { AuthUser, Public } from '../common/roles';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const employee = await this.employees.findOne({
      where: { userId: user.id },
    });
    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId: employee?.id ?? null,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: payload.employeeId,
      },
    };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
