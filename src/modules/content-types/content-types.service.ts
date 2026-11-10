import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../../common/errors.js';
import { Prisma, type ContentType } from '../../generated/prisma/client.js';
import type { SocialPlatform } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { deliverablesToJson as toJson } from './deliverables.js';
import type { CreateContentTypeDto, UpdateContentTypeDto } from './dto/content-type.dto.js';

const ORDER = [{ sortOrder: 'asc' }, { name: 'asc' }] satisfies Prisma.ContentTypeOrderByWithRelationInput[];

const isUniqueClash = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** The kinds of campaign a business can post. Admins manage them; businesses pick one. */
@Injectable()
export class ContentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** What businesses can pick, in display order. With platforms, only types that work on all of them. */
  listActive(platforms?: SocialPlatform[]): Promise<ContentType[]> {
    return this.prisma.contentType.findMany({
      where: { active: true, ...(platforms?.length && { platforms: { hasEvery: platforms } }) },
      orderBy: ORDER,
    });
  }

  /** Admin: every type, hidden ones included. */
  listAll(): Promise<ContentType[]> {
    return this.prisma.contentType.findMany({ orderBy: ORDER });
  }

  async get(id: string): Promise<ContentType> {
    const type = await this.prisma.contentType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Content type not found');
    return type;
  }

  async create(dto: CreateContentTypeDto): Promise<ContentType> {
    const deliverables = toJson(dto.deliverables);
    try {
      return await this.prisma.contentType.create({ data: { ...dto, deliverables } });
    } catch (error) {
      if (isUniqueClash(error)) {
        throw apiError(HttpStatus.CONFLICT, 'SLUG_TAKEN', 'Another content type already uses that slug.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateContentTypeDto): Promise<ContentType> {
    await this.get(id);
    const { deliverables, ...rest } = dto;
    return this.prisma.contentType.update({
      where: { id },
      data: { ...rest, ...(deliverables && { deliverables: toJson(deliverables) }) },
    });
  }
}
