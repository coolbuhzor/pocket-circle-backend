import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'Ada' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ example: 'Augusta' })
  @IsOptional()
  @IsString()
  middleName?: string;

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

  @ApiProperty({ example: '058', description: 'Paystack bank code' })
  @IsString()
  @MinLength(1)
  bankCode: string;

  @ApiProperty({ example: '0123456789', description: 'Exactly 10 digits' })
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'accountNumber must be exactly 10 digits',
  })
  accountNumber: string;
}
