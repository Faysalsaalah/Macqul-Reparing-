import {createClient} from '@supabase/supabase-js';
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const result=await client.from('app_users').select('id').limit(1);
console.log(JSON.stringify({status:result.status,code:result.error?.code??null,tableReadable:!result.error}));
const response=await fetch(new URL('/rest/v1/',process.env.NEXT_PUBLIC_SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+process.env.SUPABASE_SECRET_KEY,Accept:'application/openapi+json'}});
if(response.ok){const spec=await response.json();console.log(JSON.stringify({exposedTables:Object.keys(spec.paths??{}).filter(path=>!path.includes('/rpc/')).map(path=>path.replace(/^\//,''))}));}else console.log(JSON.stringify({catalogStatus:response.status}));

const members=await client.from('app_users').select('id,role,active').limit(10);
console.log(JSON.stringify({memberStatus:members.status,memberErrorCode:members.error?.code??null,memberCount:members.data?.length??null,activeAdmins:members.data?.filter(u=>u.active&&u.role==='Admin').length??null}));
const profiles=await client.auth.admin.listUsers({page:1,perPage:10});
console.log(JSON.stringify({authUserCount:profiles.data?.users?.length??null,authErrorCode:profiles.error?.code??null}));
