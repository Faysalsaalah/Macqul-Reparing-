import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {shopIdentity} from '../../../lib/auth';
import {databaseClient} from '../../../lib/supabase/admin';
import {dataMode} from '../../../lib/supabase/config';
import {loadWorkspace as loadRawWorkspace} from '../../../lib/supabase/workspace';
import {applyCloudMutation,Mutation} from '../../../lib/cloud-mutations';
import {requireMember} from '../../../lib/technician';
import {projectWorkspace,mergeCandidate} from '../../../lib/permissions';
import type {CloudWorkspace} from '../../../lib/cloud-types';
const project=(state:CloudWorkspace,actor:string)=>({...state,data:projectWorkspace(state.data,actor,state.data.access!)});
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
class RequestTooLarge extends Error {}
async function limitedBody(request:NextRequest){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>5000000){await reader.cancel();throw new RequestTooLarge();}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder().decode(bytes);
}
async function loadWorkspace(...args:Parameters<typeof loadRawWorkspace>){const state=await loadRawWorkspace(...args);try{requireMember(state.data,args[0]);if(state.data.access?.technical)throw Error('Use the technician workspace.')}catch{throw Object.assign(new Error('Admin access required.'),{code:'42501'})}return state;}
async function actor(){if(dataMode()!=='supabase')return null;const user=await shopIdentity();return user?.id?{id:user.id}:null;}
export async function GET(){
 try{const user=await actor();if(!user)return reply({error:'Sign in to the shared workspace.'},401);return reply(project(await loadWorkspace(user.id),user.id));}
 catch{return reply({error:'Could not load the shared workspace. Check your access or contact the Admin.'},403);}
}
export async function POST(request:NextRequest){
 const expectedOrigin=process.env.APP_ORIGIN??new URL(request.url).origin;
 if(request.headers.get('origin')!==expectedOrigin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Invalid request origin.'},403);
 try{
  const user=await actor();if(!user)return reply({error:'Sign in to save changes.'},401);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Expected JSON.'},415);
  if(Number(request.headers.get('content-length')??0)>5000000)return reply({error:'This workspace exceeds the current 5 MB transfer limit.'},413);
  const raw=await limitedBody(request);
  let input:Mutation;try{input=JSON.parse(raw)}catch{return reply({error:'Invalid JSON.'},400)}
  if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.requestId)||typeof input.action!=='string'||typeof input.record!=='string')return reply({error:'Invalid save request.'},400);
  const hash=createHash('sha256').update(raw).digest('hex');
  const state=await loadWorkspace(user.id,input.requestId,hash);
  if(state.replayed)return reply(project(state,user.id));
  if(state.revision!==input.revision)return reply({error:'Another user changed the workspace. The latest records have been loaded. Review them and try again.',workspace:project(state,user.id)},409);
  let next;
  try{input.candidate=mergeCandidate(state.data,input.candidate,user.id,state.data.access!,input.action);next=applyCloudMutation(state.data,user.id,input)}catch(e){return reply({error:e instanceof Error?e.message:'Invalid change.'},422)}
  const {error}=await databaseClient().rpc('commit_workspace',{p_actor:user.id,p_expected_revision:input.revision,p_request_id:input.requestId,p_request_hash:hash,p_action:input.action,p_data:next});
  if(error){if(error.code==='40001')return reply({error:'Another user saved a change. Review the latest records and try again.',workspace:project(await loadWorkspace(user.id),user.id)},409);if(error.code==='42501')return reply({error:'You no longer have permission to save this change.'},403);if(error.code==='23503'&&input.action==='users')return reply({error:'Ask the setup operator to provision and link this workshop account first.'},422);if(error.code?.startsWith('22')||error.code?.startsWith('23'))return reply({error:'The database rejected this change. No partial change was saved.'},422);return reply({error:'The save result could not be confirmed. Retry the same save.'},503);}
  return reply(project(await loadWorkspace(user.id),user.id));
 }catch(error){
  if(error instanceof RequestTooLarge)return reply({error:'This request is too large.'},413);
  const code=typeof error==='object'&&error!==null&&'code' in error?error.code:null;
  if(code==='42501')return reply({error:'This account has no active shop access.'},403);
  if(code==='23505')return reply({error:'This request ID has already been used.'},409);
  return reply({error:'The save result could not be confirmed. Retry the same save before making another change.'},503);
 }
}
