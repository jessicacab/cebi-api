import { Module } from '@nestjs/common';
import { AiClient, OpenAiClient } from './ai-client.js';
import { AiUsage } from './ai-usage.js';

/** The AI model (OpenAI) and per-user usage limits. */
@Module({
  providers: [{ provide: AiClient, useClass: OpenAiClient }, AiUsage],
  exports: [AiClient, AiUsage],
})
export class AiModule {}
