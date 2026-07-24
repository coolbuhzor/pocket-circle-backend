import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateContributionDto {
  @ApiProperty({ example: 5000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 'Paid via transfer' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}
