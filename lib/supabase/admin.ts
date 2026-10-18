import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from './config';

export function databaseClient(){
 const {url}=supabaseConfig();
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!key)throw new Error('The server database key is not configured.');
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
