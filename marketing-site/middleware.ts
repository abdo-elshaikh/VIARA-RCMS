import { NextResponse, type NextRequest } from 'next/server';
export function middleware(request:NextRequest) {
 const headers=new Headers(request.headers);
 headers.set('x-viara-locale',request.nextUrl.pathname==='/en'||request.nextUrl.pathname.startsWith('/en/')?'en':'ar');
 return NextResponse.next({request:{headers}});
}
export const config={matcher:['/((?!api|_next|assets|fonts|favicon).*)']};
