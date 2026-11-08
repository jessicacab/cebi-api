import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Env } from './config/env.js';

/** Shared by main.ts and the e2e tests so both run the same app. */
export const configureApp = (app: INestApplication) => {
  const config = app.get(ConfigService<Env, true>);

  // Behind a load balancer, read the caller's IP from X-Forwarded-For so
  // rate limits count each phone separately.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }

  app.use(helmet());
  // Only the admin CRM runs in a browser; the mobile app doesn't need CORS.
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

  // Routes live under /v1/... so old app versions keep working after changes.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const swaggerEnabled =
    config.get('SWAGGER_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';

  if (swaggerEnabled) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Cebi API')
        .setDescription('Backend for the Cebi mobile app and admin CRM')
        .setVersion('1')
        .addBearerAuth()
        .addSecurityRequirements('bearer')
        .build(),
    );
    // UI at /docs, raw spec at /docs/json (used to generate typed clients).
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/json' });
  }
};
