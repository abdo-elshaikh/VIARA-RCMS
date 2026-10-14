import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getAdmin,sameOrigin } from '../../../../lib/admin-auth';
import { getDb } from '../../../../db';
import { reviews } from '../../../../db/schema';
import { reviewSchema } from '../../../../lib/review';
export const dynamic='force-dynamic';
export async function GET() {
 if(!await getAdmin())return NextResponse.json({error:'Unauthorized'},{status:403});
 try {return NextResponse.json({records:await getDb().select().from(reviews).orderBy(desc(reviews.createdAt)).limit(200)},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Reviews unavailable'},{status:503});}
}
export async function POST(request:Request) {
 const admin=await getAdmin();if(!admin || !sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:403});
 try {const data=reviewSchema.safeParse(await request.json());if(!data.success)return NextResponse.json({error:'راجع بيانات الرأي وموافقة العميل / Check the review and customer consent'},{status:400});
 const {consent:_c,website:_w,...row}=data.data;await getDb().insert(reviews).values({...row,consent:1,userId:admin.userId,status:'approved',createdAt:Date.now()});return NextResponse.json({ok:true},{status:201});}
 catch{return NextResponse.json({error:'تعذر حفظ الرأي / Save failed'},{status:503});}
}
export async function PATCH(request:Request) {
 if(!await getAdmin() || !sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:403});
 try {const data=z.object({id:z.string().uuid(),status:z.enum(['pending','approved','rejected'])}).safeParse(await request.json());if(!data.success)return NextResponse.json({error:'Invalid data'},{status:400});
 const rows=await getDb().update(reviews).set({status:data.data.status}).where(eq(reviews.id,data.data.id)).returning({id:reviews.id});return rows.length?NextResponse.json({ok:true}):NextResponse.json({error:'Not found'},{status:404});}
 catch{return NextResponse.json({error:'Update failed'},{status:503});}
}
export async function DELETE(request:Request) {
 if(!await getAdmin() || !sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:403});
 const id=new URL(request.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Invalid id'},{status:400});
 try{const rows=await getDb().delete(reviews).where(eq(reviews.id,id!)).returning({id:reviews.id});return rows.length?NextResponse.json({ok:true}):NextResponse.json({error:'Not found'},{status:404});}catch{return NextResponse.json({error:'Delete failed'},{status:503});}
}
