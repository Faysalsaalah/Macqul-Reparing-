// Operator-only linking: node --env-file=.env.local scripts/link-clerk-user.mjs <Clerk ID> [workshop UUID]
// Without a UUID, only the existing sole active Admin can be linked.
import {createClient} from '@supabase/supabase-js';
const clerkId=process.argv[2],requestedId=process.argv[3];
if(!/^user_[A-Za-z0-9]+$/.test(clerkId??''))throw Error('Supply the exact Clerk User ID.');
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:members,error}=await client.from('app_users').select('id,role,active');
if(error)throw Error('Could not read workshop membership.');
const candidates=members.filter(u=>requestedId?u.id===requestedId:u.role==='Admin'&&u.active);
if(candidates.length!==1)throw Error('Specify one existing workshop member.');
const member=candidates[0];
const {data:account,error:accountError}=await client.auth.admin.getUserById(member.id);
if(accountError||!account?.user?.email)throw Error('Workshop identity was not found.');
async function clerk(path,options={}){
 const response=await fetch('https://api.clerk.com/v1'+path,{...options,headers:{Authorization:'Bearer '+process.env.CLERK_SECRET_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Clerk did not confirm this operation ('+response.status+').');
 return response.json();
}
const user=await clerk('/users/'+clerkId);
const email=user.email_addresses.find(e=>e.id===user.primary_email_address_id);
if(email?.verification?.status!=='verified'||email.email_address.toLowerCase()!==account.user.email.toLowerCase())throw Error('The verified primary email must match the existing workshop account.');
if(user.external_id&&user.external_id!==member.id)throw Error('This Clerk account is already linked to another identity.');
const existing=await clerk('/users?external_id='+encodeURIComponent(member.id));
if(existing.some(u=>u.id!==clerkId))throw Error('Another Clerk account already owns this identity.');
if(user.external_id!==member.id)await clerk('/users/'+clerkId,{method:'PATCH',body:JSON.stringify({external_id:member.id})});
if((await clerk('/users/'+clerkId)).external_id!==member.id)throw Error('Link verification failed.');
console.log(JSON.stringify({linked:true,role:member.role,active:member.active,credentialsChanged:false,emailsSent:0}));
