import {clerkMiddleware} from '@clerk/nextjs/server';
import {NextRequest,NextResponse,NextFetchEvent} from 'next/server';
const clerk=clerkMiddleware();
export default function middleware(request:NextRequest,event:NextFetchEvent){
 if(process.env.APP_DATA_MODE!=='supabase')return NextResponse.next();
 return clerk(request,event);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
