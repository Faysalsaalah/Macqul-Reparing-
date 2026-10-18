// Owner-authorized operator utility; role stays Staff. No invitations or passwords.
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {applyCloudMutation,type Mutation} from '../lib/cloud-mutations';
import {technicianView} from '../lib/technician';
import type {CloudWorkspace} from '../lib/cloud-types';
async function main(){
 const [email,scope]=process.argv.slice(2);if(!email||!['all','assigned'].includes(scope))throw Error('Supply staff email and all or assigned.');
 if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname!==process.env.EXPECTED_SUPABASE_PROJECT_HOST)throw Error('Unexpected project.');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const identities=await db.auth.admin.listUsers({page:1,perPage:1000});if(identities.error||identities.data.users.length>=1000)throw Error('Could not inspect internal accounts safely.');
 const targets=identities.data.users.filter(user=>user.email?.toLowerCase()===email.toLowerCase());if(targets.length!==1)throw Error('Staff account was not found uniquely.');
 const memberships=await db.from('app_users').select('id,shop_id,role,active');if(memberships.error)throw Error('Could not read memberships.');
 const admins=memberships.data.filter(user=>user.role==='Admin'&&user.active);if(admins.length!==1)throw Error('Owner selection requires review.');
 const admin=admins[0],target=memberships.data.find(user=>user.id===targets[0].id&&user.shop_id===admin.shop_id&&user.active&&user.role==='Staff');if(!target)throw Error('Active Staff membership required.');
 const loaded=await db.rpc('load_workspace',{p_actor:admin.id});if(loaded.error)throw Error('Could not read the workshop.');
 const state=loaded.data as CloudWorkspace;
 if((state.data.users.find(user=>user.id===target.id)?.repairScope??'assigned')!==scope){
  const candidate=structuredClone(state.data);candidate.users.find(user=>user.id===target.id)!.repairScope=scope as 'all'|'assigned';
  const command:Mutation={action:'users',record:'Repair access',candidate,revision:state.revision,requestId:randomUUID()};
  const next=applyCloudMutation(state.data,admin.id,command),hash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const saved=await db.rpc('commit_workspace',{p_actor:admin.id,p_expected_revision:state.revision,p_request_id:command.requestId,p_request_hash:hash,p_action:'users',p_data:next});if(saved.error)throw Error('Permission save was not confirmed; rerun to inspect current state.');
 }
 const checked=await db.rpc('load_workspace',{p_actor:target.id});if(checked.error)throw Error('Permission verification failed.');
 const view=technicianView(checked.data.data,target.id,checked.data.revision);
 if(view.repairScope!==scope)throw Error('Repair scope was not confirmed.');
 console.log(JSON.stringify({role:'Staff',repairScope:view.repairScope,accessibleRepairs:view.repairs.length,financialDataExposed:'customerPayments' in view,invitationSent:false}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Permission setup failed.');process.exitCode=1});
