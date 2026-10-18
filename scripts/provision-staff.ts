// Operator-only account preparation. Does not send invitations or set passwords.
// node --env-file=.env.local --import tsx scripts/provision-staff.ts <email> <name> <phone>
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {applyCloudMutation,type Mutation} from '../lib/cloud-mutations';
import type {CloudWorkspace} from '../lib/cloud-types';

async function main(){
 const [emailInput,nameInput,phoneInput='']=process.argv.slice(2);
 const email=(emailInput??'').trim().toLowerCase(),name=(nameInput??'').trim(),phone=phoneInput.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>120||phone.length>60)throw Error('Supply valid staff email, name and contact phone.');
 if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname!==process.env.EXPECTED_SUPABASE_PROJECT_HOST)throw Error('Unexpected workshop project.');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 async function clerk(path:string,options:RequestInit={}){
  const response=await fetch('https://api.clerk.com/v1'+path,{...options,headers:{Authorization:'Bearer '+process.env.CLERK_SECRET_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)});
  if(!response.ok){const body=await response.json().catch(()=>null);throw Error('Clerk operation failed ('+response.status+'): '+(body?.errors?.[0]?.code??'unknown'));}
  return response.json();
 }
 const {data:members,error}=await db.from('app_users').select('id,shop_id,role,active');if(error)throw Error('Could not inspect memberships.');
 const admins=members.filter(user=>user.role==='Admin'&&user.active);if(admins.length!==1)throw Error('Exactly one active owner is required for this operator setup.');
 const admin=admins[0];
 const matches=await clerk('/users?email_address='+encodeURIComponent(email));
 if(!Array.isArray(matches)||matches.length>1)throw Error('Ambiguous Clerk account.');
 let user=matches[0];
 const {data:accounts,error:listError}=await db.auth.admin.listUsers({page:1,perPage:1000});if(listError||accounts.users.length===1000)throw Error('Could not inspect internal identities safely.');
 const internalMatches=accounts.users.filter(account=>account.email?.toLowerCase()===email);if(internalMatches.length>1)throw Error('Ambiguous internal identity.');
 let internal=internalMatches[0];
 if(internal){const member=members.find(member=>member.id===internal.id);if(member&&(member.shop_id!==admin.shop_id||member.role!=='Staff'||!member.active))throw Error('This account already has different workshop access.');}
 if(user?.external_id&&user.external_id!==internal?.id)throw Error('Clerk account is already linked elsewhere.');
 // Internal auth identities anchor UUID foreign keys only. No interactive password is created.
 if(!internal){const result=await db.auth.admin.createUser({email,email_confirm:false,user_metadata:{name,contact_phone:phone}});if(result.error||!result.data.user)throw Error('Internal staff identity was not confirmed. Re-run safely before retrying.');internal=result.data.user;}
 if(!user){user=await clerk('/users',{method:'POST',body:JSON.stringify({email_address:[email],email_address_identification_status:['reserved'],first_name:name,skip_password_requirement:true,external_id:internal.id})});}
 else if(user.external_id!==internal.id){user=await clerk('/users/'+user.id,{method:'PATCH',body:JSON.stringify({external_id:internal.id})});}
 const loaded=await db.rpc('load_workspace',{p_actor:admin.id});if(loaded.error)throw Error('Could not load workshop.');const state=loaded.data as CloudWorkspace;
 const existing=state.data.users.find(member=>member.id===internal.id);
 if(existing&&(existing.role!=='Staff'||!existing.active))throw Error('Existing access requires manual review.');
 if(!existing){
  const candidate=structuredClone(state.data);candidate.users.push({id:internal.id,name,role:'Staff',active:true});
  const command:Mutation={action:'users',record:name,candidate,revision:state.revision,requestId:randomUUID()};
  const next=applyCloudMutation(state.data,admin.id,command),hash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const saved=await db.rpc('commit_workspace',{p_actor:admin.id,p_expected_revision:state.revision,p_request_id:command.requestId,p_request_hash:hash,p_action:'users',p_data:next});
  if(saved.error)throw Error('Staff access was not confirmed. Re-run to inspect state before retrying.');
 }
 const verified=await db.rpc('load_workspace',{p_actor:internal.id});
 const identity=await clerk('/users/'+user.id);
 if(verified.error||identity.external_id!==internal.id||!verified.data?.data?.users?.some((member:{id:string;role:string;active:boolean})=>member.id===internal.id&&member.role==='Staff'&&member.active))throw Error('Staff verification failed.');
 // Exercise server authorization without committing any change.
 const unauthorized:Mutation={action:'settings',record:'Permission check',candidate:structuredClone(verified.data.data),revision:verified.data.revision,requestId:randomUUID()};
 unauthorized.candidate.settings.name='Permission check';let denied=false;try{applyCloudMutation(verified.data.data,internal.id,unauthorized)}catch{denied=true;}
 if(!denied)throw Error('Staff permission check failed.');
 console.log(JSON.stringify({name,role:'Staff',active:true,linked:true,workspaceAccessVerified:true,adminSettingsDenied:true,invitationSent:false,passwordCreated:false}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Staff setup failed.');process.exitCode=1});
