import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        email: true,
        bankName: true,
        accountNumber: true,
        createdAt: true,
      },
    });
  }
}
