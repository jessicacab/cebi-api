// Demo creators who apply to one of your LIVE campaigns, so you can try
// approving and declining in the app before the creator side is built.
//
// It writes to the database in DATABASE_URL (your .env), so only run it
// against a development database. Demo creators can't sign in (they have no
// Supabase account) and all use emails ending in @demo.cebi.test.
//
//   node scripts/demo-applicants.mjs <campaign id> [how many, default 4]
//   node scripts/demo-applicants.mjs --submit <campaign id>   demo creators you approved send their content
//   node scripts/demo-applicants.mjs --remove     removes every demo creator and their applications
//
// The campaign id is in the app's campaign screen address, or in Prisma
// Studio (npm run db:studio).

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const DEMO_DOMAIN = '@demo.cebi.test';
const PEOPLE = [
  ['Bea Santos', 'food', 'Here for the cakes! I post Cebu food spots every week.'],
  ['Migo Reyes', 'lifestyle', null],
  ['Joy Lim', 'food', 'My followers are mostly students near IT Park.'],
  ['Paolo Cruz', 'travel', null],
  ['Ana Villanueva', 'beauty', 'Happy to do a before and after style video.'],
  ['Kai Tan', 'food', null],
];

const [arg, countArg] = process.argv.slice(2);
if (!arg) {
  console.log('Usage: node scripts/demo-applicants.mjs <campaign id> [how many]  |  --remove');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  if (arg === '--submit') {
    if (!countArg) throw new Error('Usage: --submit <campaign id>');
    const { rowCount } = await client.query(
      `UPDATE creator_deliverables d
          SET status = 'SUBMITTED', submitted_at = now(), updated_at = now(),
              content_url = 'https://www.tiktok.com/@cebi.demo/video/' || floor(random() * 1e9)::text,
              caption = 'Loved it! Demo post for Cebi.'
         FROM campaign_applications a JOIN users u ON u.id = a.creator_id
        WHERE d.application_id = a.id AND a.campaign_id = $1 AND u.email LIKE $2
          AND d.status IN ('TODO', 'CHANGES_REQUESTED')`,
      [countArg, `%${DEMO_DOMAIN}`],
    );
    console.log(rowCount ? `Demo creators sent ${rowCount} pieces for review. Pull to refresh Ongoing.` : 'Nothing to send. Approve demo creators in the app first.');
  } else if (arg === '--remove') {
    const { rowCount } = await client.query('DELETE FROM users WHERE email LIKE $1', [`%${DEMO_DOMAIN}`]);
    console.log(`Removed ${rowCount} demo creators and their applications.`);
  } else {
    const { rows } = await client.query(
      `SELECT c.title, c.status, c.platforms::text[] AS platforms, bp.city
         FROM campaigns c LEFT JOIN business_profiles bp ON bp.user_id = c.business_id
        WHERE c.id = $1`,
      [arg],
    );
    const campaign = rows[0];
    if (!campaign) throw new Error(`No campaign with id ${arg}.`);
    if (campaign.status !== 'LIVE') throw new Error(`"${campaign.title}" is ${campaign.status}. Make it live in the app first.`);

    const count = Math.min(Number(countArg) || 4, PEOPLE.length);
    for (const [name, niche, note] of PEOPLE.slice(0, count)) {
      const slug = name.toLowerCase().replace(/\s+/g, '.');
      const email = `${slug}.${randomBytes(3).toString('hex')}${DEMO_DOMAIN}`;
      const handle = `${slug.replace('.', '')}_${randomBytes(2).toString('hex')}`;
      const user = await client.query(
        `INSERT INTO users (id, auth_id, email, name, role, status, onboarded_at, created_at, updated_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, 'CREATOR', 'ACTIVE', now(), now(), now())
         RETURNING id`,
        [email, name],
      );
      const creatorId = user.rows[0].id;
      await client.query(
        `INSERT INTO creator_profiles (user_id, handle, city, platforms, niches, created_at, updated_at)
         VALUES ($1, $2, $3, $4::"SocialPlatform"[], $5, now(), now())`,
        [creatorId, handle, campaign.city ?? 'Cebu City', campaign.platforms, [niche]],
      );
      await client.query(
        `INSERT INTO campaign_applications (id, campaign_id, creator_id, status, note, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'PENDING', $3, now(), now())`,
        [arg, creatorId, note],
      );
      console.log(`  ${name} (@${handle}) applied`);
    }
    console.log(`Added ${count} demo creators to "${campaign.title}". Pull to refresh the campaign in the app.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
