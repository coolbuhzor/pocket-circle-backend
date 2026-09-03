import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class CreateInviteDto {
  @ApiPropertyOptional({
    example: 'friend@example.com',
    description:
      'Optional invitee email. Sends a Resend invite email (demo mode returns the payload). If a matching user exists, they also get an in-app notification.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
