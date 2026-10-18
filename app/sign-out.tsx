'use client';
import {SignOutButton} from '@clerk/nextjs';
export default function SignOut(){return <SignOutButton redirectUrl="/login"><button type="button">Sign Out</button></SignOutButton>}
