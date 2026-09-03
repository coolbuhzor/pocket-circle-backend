import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { BanksService } from '../banks/banks.service';
import { namesMatchLoose, withDisplayName } from '../common/helpers/user-name';
import { userNameSelect } from '../common/helpers/user-select';
import { EmailService } from '../email/email.service';
import { RESEND_DEMO_NOTE } from '../email/email.types';
import { PrismaService } from '../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import {
  RESET_TOKEN_EXPIRED,
  RESET_TOKEN_INVALID,
  RESET_TOKEN_TTL_MS,
  RESET_TOKEN_USED,
} from './password-reset.constants';

const userPublicSelect = {
  id: true,
  ...userNameSelect,
  email: true,
  bankName: true,
  bankCode: true,
  accountNumber: true,
  bankVerified: true,
  notifyEmail: true,
  notifyWhatsApp: true,
  isSuperAdmin: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly banksService: BanksService,
    private readonly emailService: EmailService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const middleName = dto.middleName?.trim() || null;

    // Informational only — never block signup on resolve/match failure.
    let bankVerified = false;
    const resolved = await this.banksService.resolveAccount(
      dto.accountNumber,
      dto.bankCode,
    );
    if (resolved.resolved) {
      bankVerified = namesMatchLoose(resolved.accountName, firstName, lastName);
    }

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        middleName,
        email: dto.email.toLowerCase(),
        password,
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        bankVerified,
        notifyEmail: true,
        notifyWhatsApp: true,
      },
      select: userPublicSelect,
    });

    return {
      user: withDisplayName(user),
      accessToken: await this.signToken(user.id, user.email),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: userPublicSelect,
    });

    return {
      user: withDisplayName(updated),
      accessToken: await this.signToken(user.id, user.email),
    };
  }

  logout() {
    return { ok: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: userPublicSelect,
    });
    return withDisplayName(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: dto.email.toLowerCase(),
          NOT: { id: userId },
        },
      });
      if (existing) {
        throw new ConflictException('Email is already registered');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName.trim() }),
        ...(dto.middleName !== undefined && {
          middleName: dto.middleName?.trim() || null,
        }),
        ...(dto.email !== undefined && { email: dto.email.toLowerCase() }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankCode !== undefined && { bankCode: dto.bankCode }),
        ...(dto.accountNumber !== undefined && {
          accountNumber: dto.accountNumber,
        }),
        ...(dto.notifyEmail !== undefined && { notifyEmail: dto.notifyEmail }),
        ...(dto.notifyWhatsApp !== undefined && {
          notifyWhatsApp: dto.notifyWhatsApp,
        }),
      },
      select: userPublicSelect,
    });

    return withDisplayName(user);
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return {
        ok: true,
        demoMode: this.emailService.isDemoMode(),
        delivered: false,
        deliveryNote: RESEND_DEMO_NOTE,
        deliveryError: null,
        email: {
          to: email,
          subject: 'Reset your Pocket Circle password',
          body: [
            'We received a request to reset a Pocket Circle password for this address.',
            '',
            'If an account exists, a reset link would appear here.',
            '',
            'If you did not request this, you can ignore this message.',
          ].join('\n'),
        },
      };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          supersededAt: null,
        },
        data: { supersededAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      }),
    ]);

    const resetUrl = `${this.emailService.frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const sent = await this.emailService.send({
      to: user.email,
      subject: 'Reset your Pocket Circle password',
      body: [
        'Reset your Pocket Circle password using this link (expires in 15 minutes):',
        '',
        resetUrl,
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
    });

    return {
      ok: true,
      demoMode: sent.demoMode,
      delivered: sent.delivered,
      deliveryNote: sent.deliveryNote,
      deliveryError: sent.deliveryError,
      email: sent.payload,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashResetToken(dto.token.trim());
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      throw new BadRequestException(RESET_TOKEN_INVALID);
    }
    if (record.usedAt) {
      throw new BadRequestException(RESET_TOKEN_USED);
    }
    if (record.supersededAt) {
      throw new BadRequestException(RESET_TOKEN_USED);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(RESET_TOKEN_EXPIRED);
    }

    const password = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private signToken(userId: string, email: string) {
    return this.jwtService.signAsync({ sub: userId, email });
  }
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
