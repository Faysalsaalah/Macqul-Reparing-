import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(new URL(url).hostname!==process.env.EXPECTED_SUPABASE_PROJECT_HOST)throw new Error('Unexpected project. Bootstrap stopped.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:auth,error:authError}=await client.auth.admin.listUsers({page:1,perPage:2});
if(authError||auth.users.length!==1){console.error('Exactly one Auth account must exist before this first Admin setup.');process.exit(1);}
const account=auth.users[0];
const {data:members,error:memberError}=await client.from('app_users').select('id,role,active');
if(memberError){console.error('Could not check shop membership.');process.exit(1);}
if(members.length){if(members.length===1&&members[0].id===account.id&&members[0].role==='Admin'&&members[0].active){console.log('The account is already the active Admin. No change was made.');process.exit(0);}console.error('Existing memberships require review. Bootstrap stopped.');process.exit(1);}
const source=await readFile('supabase/bootstrap.sql','utf8');
const match=source.match(/'({[^]*})'::jsonb/);
if(!match)throw new Error('Shop defaults were not found.');
const settings=JSON.parse(match[1].replaceAll("''","'"));
const {error}=await client.rpc('bootstrap_shop',{p_shop:randomUUID(),p_admin:account.id,p_name:'Shop Admin',p_settings:settings});
if(error){console.error('The database did not confirm Admin setup. Re-run this check before retrying.');process.exit(1);}
const {data:state,error:loadError}=await client.rpc('load_workspace',{p_actor:account.id});
if(loadError||!state?.data?.users?.some(user=>user.id===account.id&&user.role==='Admin'&&user.active)){console.error('Admin verification could not be completed.');process.exit(1);}
const report=JSON.parse(await readFile('verification/supabase-status.json','utf8'));
report.verified.authUsersAtVerification=1;report.verified.activeAdminMemberships=1;report.verified.emptySharedWorkspace=state.data.repairs.length===0&&state.data.customerPayments.length===0;
report.pending=['Owner signs into the app','Secret key rotation before business use','Staff account and two-device testing'];
await writeFile('verification/supabase-status.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({adminAssigned:true,sharedWorkspaceReadable:true,repairs:state.data.repairs.length,customerPayments:state.data.customerPayments.length,emailsSent:0}));
