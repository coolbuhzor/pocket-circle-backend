import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DisputeContributionDto {
  @ApiProperty({ example: 'Amount does not match receipt' })
  @IsString()
  @MinLength(1)
  reason: string;
}
