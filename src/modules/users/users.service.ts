import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Paginated } from '../../common/dto/pagination.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type {
  AdminUpdateUserDto,
  ListUsersQuery,
  UpdateMeDto,
} from './dto/user.dto.js';

/** Who Supabase Auth says the person is. */
export interface AuthIdentity {
  /** Supabase Auth user id. */
  authId: string;
  email?: string;
  phone?: string;
  name?: string;
}

/** The user plus the profile filled in during sign-up. */
const accountInclude = {
  creatorProfile: true,
  businessProfile: true,
} satisfies Prisma.UserInclude;

export type Account = Prisma.UserGetPayload<{ include: typeof accountInclude }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called on every signed-in request and after each sign-in; creates the
   * record the first time. Fills in an email or phone the record is missing.
   */
  async findOrCreate(identity: AuthIdentity): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { authId: identity.authId },
    });
    if (existing) {
      const missing = {
        ...(!existing.email && identity.email && { email: identity.email }),
        ...(!existing.phone && identity.phone && { phone: identity.phone }),
      };
      if (Object.keys(missing).length === 0) return existing;
      return this.prisma.user.update({ where: { id: existing.id }, data: missing });
    }

    // upsert so two first requests arriving together don't collide.
    return this.prisma.user.upsert({
      where: { authId: identity.authId },
      update: {},
      create: {
        authId: identity.authId,
        email: identity.email,
        phone: identity.phone,
        name: identity.name,
      },
    });
  }

  /** The user with their creator or business profile. */
  getAccount(id: string): Promise<Account> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: accountInclude,
    });
  }

  async updateMe(user: User, dto: UpdateMeDto): Promise<Account> {
    if (dto.role && user.role && dto.role !== user.role) {
      throw new ConflictException('Account type is already set');
    }
    if (user.role === 'ADMIN' && dto.role) {
      throw new ForbiddenException('Admins cannot change their account type');
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { name: dto.name, avatarUrl: dto.avatarUrl, role: dto.role },
      include: accountInclude,
    });
  }

  async list(query: ListUsersQuery): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      status: query.status,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return new Paginated(items, total, query.page, query.pageSize);
  }


  async adminUpdate(
    admin: User,
    id: string,
    dto: AdminUpdateUserDto,
  ): Promise<User> {
    if (admin.id === id && (dto.role || dto.status)) {
      throw new ForbiddenException('You cannot change your own role or status');
    }
    return this.prisma.user.update({ where: { id }, data: dto });
  }
}
