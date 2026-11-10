import { AiUsage } from './ai-usage.js';

describe('AiUsage', () => {
  it('allows the daily limit per user, then answers AI_LIMIT_REACHED, and resets the next day', () => {
    const usage = new AiUsage({ get: () => 2 } as never);
    const text = 'text' as const;
    const today = new Date('2026-11-09T10:00:00Z');
    usage.take('me', text, today);
    usage.take('me', text, today);
    expect(() => usage.take('me', text, today)).toThrow("You've used today's AI suggestions");
    usage.take('me', 'image', today); // its own limit
    usage.take('you', text, today);
    usage.take('me', text, new Date('2026-11-10T10:00:00Z'));
  });
});
