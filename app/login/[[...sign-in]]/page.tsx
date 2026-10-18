import Link from 'next/link';
import {SignIn} from '@clerk/nextjs';
import {auth} from '@clerk/nextjs/server';
import {redirect} from 'next/navigation';
import {dataMode} from '../../../lib/supabase/config';
export const dynamic='force-dynamic';
export default async function LoginPage(){
 if(dataMode()!=='supabase')return <main className="auth-page"><section className="panel"><h1>Macqul Mobile Repairing</h1><Link href="/">Open Demo Workspace</Link></section></main>;
 if((await auth()).userId)redirect('/');
 return <main className="auth-page"><section><h1>maqul</h1><p>Business staff sign-in.</p><SignIn routing="path" path="/login" appearance={{elements:{footerAction:{display:'none'}}}}/><p className="muted">Private workshop system. Accounts are created by the Admin. Contact the Admin if you need access.</p></section></main>;
}
