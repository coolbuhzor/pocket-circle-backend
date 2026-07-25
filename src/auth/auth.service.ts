import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { BanksService } from '../banks/banks.service';
import {
  namesMatchLoose,
  withDisplayName,
} from '../common/helpers/user-name';
import { userNameSelect } from '../common/helpers/user-select';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateMeDto } from './dto/update-me.dto';

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
      bankVerified = namesMatchLoose(
        resolved.accountName,
        firstName,
        lastName,
      );
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

  private signToken(userId: string, email: string) {
    return this.jwtService.signAsync({ sub: userId, email });
  }
}
