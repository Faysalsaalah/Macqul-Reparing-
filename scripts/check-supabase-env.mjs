import {createClient} from '@supabase/supabase-js';

const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length){console.error('Missing configuration: '+missing.join(', '));process.exit(1);}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
let authReady=false;try{const response=await fetch(new URL('/auth/v1/settings',url),{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}});authReady=response.ok;}catch{}
if(!authReady){console.error('Auth client configuration is invalid. No key values were printed.');process.exit(1);}
const client=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.from('app_users').select('id,role,active').limit(100);
if(error){console.error(error.code==='PGRST205'?'The app tables are not installed yet. Apply the reviewed migration to the intended project.':'The shared-workspace tables could not be read. Check server access and database setup.');process.exit(1);}
if(!data.some(user=>user.active&&user.role==='Admin')){console.error('Tables are reachable, but an active Admin membership has not been created. Complete bootstrap.sql.');process.exit(1);}
console.log('Supabase tables are reachable and an active Admin membership exists. No remote data was changed.');
console.log('Keep APP_DATA_MODE=demo until you are ready to test sign-in and the two-user workflow.');
