import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendReminderDto {
  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000000',
    description: 'User id to remind',
  })
  @IsUUID()
  toUserId: string;
}
