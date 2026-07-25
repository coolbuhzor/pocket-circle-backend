import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class CreateInviteDto {
  @ApiPropertyOptional({
    example: 'friend@example.com',
    description:
      'Optional invitee email. If a matching user exists, they get an in-app notification.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
