import { Frequency } from '../../../generated/prisma/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Family Ajo' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 10000, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  contributionAmount?: number;

  @ApiPropertyOptional({ enum: Frequency, example: Frequency.monthly })
  @IsOptional()
  @IsEnum(Frequency)
  frequency?: Frequency;
}
