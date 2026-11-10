import type { Campaign, ContentType, DeliverableStatus, SocialPlatform } from '../../generated/prisma/client.js';

type Line = { format: 'VIDEO' | 'PHOTO'; count: number; minSeconds?: number; maxSeconds?: number };

export interface PieceSeed {
  format: string;
  platform: SocialPlatform | null;
  number: number;
  minSeconds: number | null;
  maxSeconds: number | null;
}

/**
 * The checklist an approved creator owes: every deliverable line, `count`
 * times, on every platform. When creators don't post (UGC) there is no
 * platform, so each piece appears once.
 */
export const piecesFor = (campaign: Pick<Campaign, 'deliverables' | 'platforms'>, type: Pick<ContentType, 'postsOnCreatorAccount'>): PieceSeed[] => {
  const lines = campaign.deliverables as unknown as Line[];
  const platforms: (SocialPlatform | null)[] = type.postsOnCreatorAccount ? campaign.platforms : [null];
  return platforms.flatMap((platform) =>
    lines.flatMap((line) =>
      Array.from({ length: line.count }, (_, i) => ({
        format: line.format,
        platform,
        number: i + 1,
        minSeconds: line.minSeconds ?? null,
        maxSeconds: line.maxSeconds ?? null,
      })),
    ),
  );
};

/** Not sent, or sent back for changes, after the content due day. */
export const isLate = (status: DeliverableStatus, contentDue: string, today: string) =>
  (status === 'TODO' || status === 'CHANGES_REQUESTED') && contentDue < today;

/**
 * How many times the business may ask for changes on one piece: the rounds it
 * set when reviewing drafts, and at least one fix otherwise.
 */
export const changesAllowed = (campaign: Pick<Campaign, 'revisions'>) => Math.max(campaign.revisions, 1);
