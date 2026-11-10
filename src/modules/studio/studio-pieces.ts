import { NotFoundException } from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

export const PIECE = {
  application: { include: { creator: { include: { creatorProfile: true } } } },
  campaign: { include: { contentType: true, business: { include: { businessProfile: true } } } },
} satisfies Prisma.CreatorDeliverableInclude;
export type Piece = Prisma.CreatorDeliverableGetPayload<{ include: typeof PIECE }>;

/** A piece the creator owes (approved), with its campaign. Someone else's answers 404. */
export const findMyPiece = async (prisma: PrismaService, creator: User, pieceId: string): Promise<Piece> => {
  const piece = await prisma.creatorDeliverable.findFirst({
    where: { id: pieceId, application: { creatorId: creator.id, status: 'APPROVED' } },
    include: PIECE,
  });
  if (!piece) throw new NotFoundException('Not found');
  return piece;
};
