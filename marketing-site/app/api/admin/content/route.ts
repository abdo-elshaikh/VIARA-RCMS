import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getAdmin, sameOrigin } from '../../../../lib/admin-auth';
import { readContent } from '../../../../lib/site-server';
import { siteContentSchema } from '../../../../lib/site-content';
import { getDb } from '../../../../db';
import { siteSettings } from '../../../../db/schema';
export const dynamic='force-dynamic';
export async function GET() {
  if (!await getAdmin()) return NextResponse.json({error:'غير مصرح / Unauthorized'},{status:403});
  try { return NextResponse.json(await readContent(), {headers:{'Cache-Control':'private, no-store'}}); }
  catch { return NextResponse.json({error:'تعذر تحميل المحتوى / Content unavailable'},{status:503}); }
}
export async function PUT(request:Request) {
  const admin=await getAdmin();
  if(!admin || !sameOrigin(request)) return NextResponse.json({error:'غير مصرح / Unauthorized'},{status:403});
  try {
    const raw=await request.text();
    if(raw.length>250000) return NextResponse.json({error:'المحتوى أكبر من المسموح / Content too large'},{status:413});
    const data=z.object({version:z.number().int().nonnegative(),content:siteContentSchema}).safeParse(JSON.parse(raw));
    if(!data.success) return NextResponse.json({error:'راجع حقول المحتوى / Check content fields',fields:data.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))},{status:400});
    const {version,content}=data.data;const next=version+1;const updatedAt=Date.now();const db=getDb();
    const values={value:JSON.stringify(content),version:next,updatedBy:admin.userId,updatedAt};
    const result=version===0 ? await db.insert(siteSettings).values({key:'main',...values}).onConflictDoNothing().returning({version:siteSettings.version}) : await db.update(siteSettings).set(values).where(and(eq(siteSettings.key,'main'),eq(siteSettings.version,version))).returning({version:siteSettings.version});
    if(!result.length) return NextResponse.json({error:'توجد نسخة أحدث. أعد تحميل المحتوى قبل الحفظ. / A newer version exists. Reload before saving.'},{status:409});
    return NextResponse.json({version:next,updatedAt},{headers:{'Cache-Control':'no-store'}});
  } catch {return NextResponse.json({error:'تعذر حفظ المحتوى. لم يتم تأكيد النشر. / Could not confirm content publication.'},{status:503});}
}
