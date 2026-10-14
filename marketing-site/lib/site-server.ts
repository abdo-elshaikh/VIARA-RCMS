import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { siteSettings, reviews } from '../db/schema';
import { siteContentSchema, defaultContent, type PublicReview } from './site-content';
export async function readContent() {
  const row = await getDb().select().from(siteSettings).where(eq(siteSettings.key, 'main')).get();
  if (!row) return { content:defaultContent, version:0, updatedAt:0 };
  return { content:siteContentSchema.parse(JSON.parse(row.value)),version:row.version,updatedAt:row.updatedAt };
}
export async function readPublicContent() {
  try { return await readContent(); } catch { return { content:defaultContent,version:0,updatedAt:0 }; }
}
export async function readPublishedReviews(): Promise<PublicReview[]> {
  try {
    return await getDb().select({ id:reviews.id,name:reviews.name,role:reviews.role,organization:reviews.organization,quote:reviews.quote,rating:reviews.rating,locale:reviews.locale,createdAt:reviews.createdAt }).from(reviews).where(eq(reviews.status,'approved')).orderBy(desc(reviews.createdAt)).limit(30);
  } catch { return []; }
}
