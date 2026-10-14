import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import { getAdmin,sameOrigin } from '../../../../lib/admin-auth';
export async function POST(request:Request) {
 if(!await getAdmin() || !sameOrigin(request))return NextResponse.json({error:'Unauthorized'},{status:403});
 if(Number(request.headers.get('content-length')||0)>3500000)return NextResponse.json({error:'Max 3 MB'},{status:413});
 try {const data=await request.formData();const file=data.get('file');if(!file || typeof file==='string' || file.size>3000000)return NextResponse.json({error:'اختر صورة حتى 3 ميجابايت / Choose an image up to 3 MB'},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!png&&!jpg&&!webp)return NextResponse.json({error:'PNG, JPEG or WebP only'},{status:400});
 if(!env.BUCKET)throw new Error('Storage unavailable');const ext=png?'png':jpg?'jpg':'webp';const key=`${crypto.randomUUID()}.${ext}`;
 await env.BUCKET.put(`media/${key}`,bytes,{httpMetadata:{contentType:png?'image/png':jpg?'image/jpeg':'image/webp'}});return NextResponse.json({url:`/api/media/${key}`},{status:201});
 }catch{return NextResponse.json({error:'تعذر رفع الصورة / Upload failed'},{status:503});}
}
