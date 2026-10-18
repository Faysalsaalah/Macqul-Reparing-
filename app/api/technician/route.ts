import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {shopIdentity} from '../../../lib/auth';
import {loadWorkspace} from '../../../lib/supabase/workspace';
import {databaseClient} from '../../../lib/supabase/admin';
import {dataMode} from '../../../lib/supabase/config';
import {technicianView,technicianMutation,requireMember,type TechnicianCommand} from '../../../lib/technician';
import {applyCloudMutation} from '../../../lib/cloud-mutations';
export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
async function actor(){if(dataMode()!=='supabase')return null;return (await shopIdentity())?.id??null;}
export async function GET(){try{const id=await actor();if(!id)return reply({error:'Sign in first.'},401);const state=await loadWorkspace(id);return reply(technicianView(state.data,id,state.revision));}catch{return reply({error:'Technician access required.'},403)}}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==(process.env.APP_ORIGIN??new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Invalid request origin.'},403);
 try{
  const id=await actor();if(!id)return reply({error:'Sign in first.'},401);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Expected JSON.'},415);
  const reader=request.body?.getReader();if(!reader)return reply({error:'Empty request.'},400);
  let raw='';const decoder=new TextDecoder();let bytes=0;for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>16000){await reader.cancel();return reply({error:'Request too large.'},413)}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
  let input:TechnicianCommand;try{input=JSON.parse(raw)}catch{return reply({error:'Invalid JSON.'},400)}
  if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.requestId)||typeof input.repairId!=='string'||typeof input.value!=='string'||!['status','diagnosis'].includes(input.action))return reply({error:'Invalid technician request.'},400);
  const hash=createHash('sha256').update(raw).digest('hex'),state=await loadWorkspace(id,input.requestId,hash);
  try{requireMember(state.data,id,'Staff')}catch{return reply({error:'Technician access required.'},403)}
  if(state.replayed)return reply(technicianView(state.data,id,state.revision));
  if(state.revision!==input.revision)return reply({error:'Records changed. Review the latest repair and try again.',workspace:technicianView(state.data,id,state.revision)},409);
  let command,next;try{command=technicianMutation(state.data,id,input);next=applyCloudMutation(state.data,id,command)}catch(error){return reply({error:error instanceof Error?error.message:'Invalid technician change.'},422)}
  const result=await databaseClient().rpc('commit_workspace',{p_actor:id,p_expected_revision:input.revision,p_request_id:input.requestId,p_request_hash:hash,p_action:command.action,p_data:next});
  if(result.error){if(result.error.code==='40001'){const current=await loadWorkspace(id);return reply({error:'Records changed. Review the latest repair.',workspace:technicianView(current.data,id,current.revision)},409)}if(result.error.code==='42501')return reply({error:'Access was revoked.'},403);if(result.error.code?.startsWith('22')||result.error.code?.startsWith('23'))return reply({error:'The database rejected this change.'},422);return reply({error:'Save not confirmed. Retry the same request.'},503)}
  return reply(technicianView(result.data.data,id,result.data.revision));
 }catch(error){const code=error&&typeof error==='object'&&'code' in error?error.code:null;if(code==='42501')return reply({error:'Workshop access is no longer active.'},403);if(code==='23505')return reply({error:'This request ID was already used.'},409);return reply({error:'Save not confirmed. Retry or contact the Admin.'},503)}
}
