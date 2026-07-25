import { Injectable } from '@nestjs/common';
import { withDisplayName } from '../common/helpers/user-name';
import { userNameSelect } from '../common/helpers/user-select';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ...userNameSelect,
        email: true,
        bankName: true,
        bankCode: true,
        accountNumber: true,
        bankVerified: true,
        createdAt: true,
      },
    });
    return users.map(withDisplayName);
  }
}
