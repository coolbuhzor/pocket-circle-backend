import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'GTBank' })
  @IsString()
  @MinLength(1)
  bankName: string;

  @ApiProperty({ example: '0123456789', description: 'Exactly 10 digits' })
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'accountNumber must be exactly 10 digits',
  })
  accountNumber: string;
}
