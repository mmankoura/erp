import {
  IsString,
  IsEmail,
  IsEnum,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { UserRole } from '../../../entities/user.entity';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @IsOptional()
  username?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @IsOptional()
  password?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  full_name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
