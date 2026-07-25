import { Frequency } from '../../../generated/prisma/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({
    type: [String],
    example: ['friend@example.com'],
    description:
      'Optional emails to invite. Creates invite tokens (creator email is skipped).',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEmail({}, { each: true })
  memberEmails?: string[];
}
