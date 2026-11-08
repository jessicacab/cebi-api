import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a session/direct connection. On Supabase, set
    // DIRECT_URL if DATABASE_URL points at the transaction pooler (6543).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
});
