import Link from 'next/link';
import {redirect} from 'next/navigation';
import {shopIdentity} from '../../lib/auth';
import {loadWorkspace} from '../../lib/supabase/workspace';
import {requireMember,technicianView} from '../../lib/technician';
import TechnicianDashboard from '../technician-dashboard';
export const dynamic='force-dynamic';
export default async function TechnicianPreview(){
 const actor=await shopIdentity();if(!actor?.id)redirect('/login');
 const state=await loadWorkspace(actor.id);
 try{requireMember(state.data,actor.id,'Admin')}catch{redirect('/')}
 const technician=state.data.users.find(user=>user.role==='Staff'&&user.active);
 if(!technician)return <main><h1>No active technician</h1><Link href="/">Back to Admin</Link></main>;
 delete state.data.access;
 return <TechnicianDashboard initial={technicianView(state.data,technician.id,state.revision)} preview/>;
}
