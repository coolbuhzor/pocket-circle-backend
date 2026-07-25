import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ResolveBankQueryDto {
  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'accountNumber must be exactly 10 digits',
  })
  accountNumber: string;

  @ApiProperty({ example: '058' })
  @IsString()
  @MinLength(1)
  bankCode: string;
}
