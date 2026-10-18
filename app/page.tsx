import Shop from './shop';
import {redirect} from 'next/navigation';
import {dataMode,supabaseConfig} from '../lib/supabase/config';
import {shopIdentity} from '../lib/auth';
import {loadWorkspace} from '../lib/supabase/workspace';
import SignOut from './sign-out';
import TechnicianDashboard from './technician-dashboard';
import {requireMember,technicianView} from '../lib/technician';
import {projectWorkspace} from '../lib/permissions';
export const dynamic='force-dynamic';
export default async function Page(){
 if(dataMode()==='demo')return <Shop mode="demo"/>;
 try{supabaseConfig()}catch{return <main className="auth-page"><section className="panel"><h1>Setup Required</h1><p>Ask the shop Admin to finish connecting the shared workspace.</p></section></main>}
 const user=await shopIdentity();
 if(!user)redirect('/login');
 try{if(!user.id)throw new Error('Account not linked');const state=await loadWorkspace(user.id);const member=requireMember(state.data,user.id);if(member.role==='Staff'&&state.data.access?.technical)return <TechnicianDashboard initial={technicianView(state.data,user.id,state.revision)}/>;state.data=projectWorkspace(state.data,user.id,state.data.access!);return <Shop mode="supabase" currentUser={user.id} initialWorkspace={state}/>}
 catch{return <main className="auth-page"><section className="panel"><h1>Shop Access Required</h1><p>Your account is signed in, but shared workshop access is not ready. Ask the shop Admin to check your account and database setup.</p><SignOut/></section></main>}
}
