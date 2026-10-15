import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getAdmin,sameOrigin } from '../../../../lib/admin-auth';
import { getDb } from '../../../../db';
import { inquiries } from '../../../../db/schema';
export const dynamic='force-dynamic';
export async function GET() {
 if(!await getAdmin())return NextResponse.json({error:'Unauthorized'},{status:403});
 try {const rows=await getDb().select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(200);return NextResponse.json({records:rows.map(({userId:_user,...row})=>row)},{headers:{'Cache-Control':'private, no-store'}});}
 catch{return NextResponse.json({error:'تعذر تحميل الطلبات / Requests unavailable'},{status:503});}
}
export async function PATCH(request:Request) {
 if(!await getAdmin() || !sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:403});
 try {const data=z.object({id:z.string().uuid(),status:z.enum(['new','contacted','proposal','won','closed'])}).safeParse(await request.json());if(!data.success)return NextResponse.json({error:'Invalid data'},{status:400});
 const row=await getDb().update(inquiries).set({status:data.data.status}).where(eq(inquiries.id,data.data.id)).returning({id:inquiries.id});
 return row.length?NextResponse.json({ok:true}):NextResponse.json({error:'Not found'},{status:404});}
 catch{return NextResponse.json({error:'تعذر تحديث الطلب / Update failed'},{status:503});}
}
