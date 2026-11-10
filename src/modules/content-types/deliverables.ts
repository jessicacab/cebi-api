import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DeliverableDto } from './dto/content-type.dto.js';

/**
 * Deliverables as plain objects for a JSON column (DTOs arrive as class
 * instances). Photos have no length; a video length range must not be upside
 * down. Used by content types and campaigns.
 */
export const deliverablesToJson = (deliverables: DeliverableDto[]): Prisma.InputJsonValue =>
  deliverables.map(({ format, count, minSeconds, maxSeconds }) => {
    if (format === 'PHOTO') return { format, count };
    if (minSeconds && maxSeconds && minSeconds > maxSeconds) {
      throw new BadRequestException(['deliverables: minSeconds must not be more than maxSeconds']);
    }
    return { format, count, ...(minSeconds && { minSeconds }), ...(maxSeconds && { maxSeconds }) };
  });
