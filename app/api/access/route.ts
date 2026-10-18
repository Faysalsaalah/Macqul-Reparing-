import {NextRequest,NextResponse} from 'next/server';
import {shopIdentity} from '../../../lib/auth';
import {databaseClient} from '../../../lib/supabase/admin';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){
 const actor=(await shopIdentity())?.id;if(!actor)return reply({error:'Sign in first.'},401);
 const {data,error}=await databaseClient().rpc('manage_access',{p_actor:actor});
 return error?reply({error:'Roles & Permissions are unavailable. Check Admin access and database setup.'},403):reply(data);
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==(process.env.APP_ORIGIN??new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Invalid request origin.'},403);
 const actor=(await shopIdentity())?.id;if(!actor)return reply({error:'Sign in first.'},401);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Expected JSON.'},415);
 const reader=request.body?.getReader();if(!reader)return reply({error:'Empty request.'},400);
 let size=0;const chunks:Uint8Array[]=[];for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32000){await reader.cancel();return reply({error:'Request too large.'},413)}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let input;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({error:'Invalid JSON.'},400)}
 if(!Number.isSafeInteger(input?.revision)||!input.command||typeof input.command!=='object')return reply({error:'Invalid change.'},400);
 const {data,error}=await databaseClient().rpc('manage_access',{p_actor:actor,p_revision:input.revision,p_command:input.command});
 if(error)return reply({error:error.code==='40001'?'Records changed. Reload access settings before saving.':error.code==='42501'?'Admin access required.':'Access change rejected. Check the selected role, user and permissions.'},error.code==='40001'?409:422);
 return reply(data);
}
