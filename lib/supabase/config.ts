import 'server-only';

export function dataMode(): 'demo'|'supabase' {
 const mode=process.env.APP_DATA_MODE??'demo';
 if(mode!=='demo'&&mode!=='supabase')throw new Error('APP_DATA_MODE must be demo or supabase.');
 return mode;
}
export function supabaseConfig(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!publishableKey)throw new Error('Supabase configuration is incomplete.');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Supabase requires HTTPS.');
 return {url,publishableKey};
}
