import { env } from 'cloudflare:workers';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;if(!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(id))return new Response('Not found',{status:404});
 try{const object=await env.BUCKET?.get(`media/${id}`);if(!object)return new Response('Not found',{status:404});return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'}});}catch{return new Response('Unavailable',{status:503});}
}
