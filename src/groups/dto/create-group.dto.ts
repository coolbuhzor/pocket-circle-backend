import { Frequency } from '../../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Family Ajo' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 10000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contributionAmount: number;

  @ApiProperty({ enum: Frequency, example: Frequency.monthly })
  @IsEnum(Frequency)
  frequency: Frequency;
}
