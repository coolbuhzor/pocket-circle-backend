import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderMembersDto {
  @ApiProperty({
    type: [String],
    example: ['uuid-1', 'uuid-2'],
    description: 'Member user ids in the desired payout order',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  userIds: string[];
}
