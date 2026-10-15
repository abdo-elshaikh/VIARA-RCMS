import { NextResponse } from 'next/server';
import { and,eq,gte,count } from 'drizzle-orm';
import { getChatGPTUser } from '../../chatgpt-auth';
import { sameOrigin } from '../../../lib/admin-auth';
import { reviewSchema } from '../../../lib/review';
import { getDb } from '../../../db';
import { reviews } from '../../../db/schema';
export async function POST(request:Request) {
 if(!sameOrigin(request))return NextResponse.json({error:'Invalid origin'},{status:403});
 const user=await getChatGPTUser();if(!user)return NextResponse.json({error:'Sign in required',signIn:'/signin-with-chatgpt?return_to=%2F%23reviews'},{status:401});
 try {const raw=await request.text();if(raw.length>12000)return NextResponse.json({error:'Too large'},{status:413});const data=reviewSchema.safeParse(JSON.parse(raw));if(!data.success)return NextResponse.json({error:'Check review and consent'},{status:400});
 const db=getDb();const recent=await db.select({n:count()}).from(reviews).where(and(eq(reviews.userId,user.userId),gte(reviews.createdAt,Date.now()-86400000))).get();if((recent?.n||0)>=3)return NextResponse.json({error:'Please try again tomorrow'},{status:429});
 const {consent:_c,website:_w,...row}=data.data;await db.insert(reviews).values({...row,consent:1,userId:user.userId,status:'pending',createdAt:Date.now()}).onConflictDoNothing();
 return NextResponse.json({ok:true},{status:201});}catch{return NextResponse.json({error:'Could not save review'},{status:503});}
}
