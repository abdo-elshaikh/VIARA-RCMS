import {desc,eq} from 'drizzle-orm';
import {getDb} from '../db';
import {inquiries} from '../db/schema';
export async function readMyRequests(userId:string){return (await getDb().select().from(inquiries).where(eq(inquiries.userId,userId)).orderBy(desc(inquiries.createdAt)).limit(100)).map(({userId:_u,...row})=>row);}
