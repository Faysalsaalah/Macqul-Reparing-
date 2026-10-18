import 'server-only';
import {auth,clerkClient} from '@clerk/nextjs/server';
import {workshopUserId} from './auth-identity';
export async function shopIdentity(){
 const {userId}=await auth();
 if(!userId)return null;
 // Read the backend-controlled identity, never browser metadata or role claims.
 const user=await (await clerkClient()).users.getUser(userId);
 return {clerkId:userId,id:workshopUserId(user.externalId)};
}
