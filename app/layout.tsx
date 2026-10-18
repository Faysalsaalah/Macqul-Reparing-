import './globals.css';
import {ClerkProvider} from '@clerk/nextjs';
export const metadata = {title:'Macqul Mobile Repairing',description:'Phone repair shop workspace'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{process.env.APP_DATA_MODE==='supabase'?<ClerkProvider signInUrl="/login" signUpUrl="/sign-up" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">{children}</ClerkProvider>:children}</body></html>}
