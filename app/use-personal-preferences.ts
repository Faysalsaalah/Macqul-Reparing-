'use client';
import {useEffect,useState} from 'react';
import {defaultPreferences,preferenceEvent,readPreferences} from '../lib/personal-preferences';
export function usePersonalPreferences(userId:string){
 const [preferences,setPreferences]=useState(defaultPreferences);
 useEffect(()=>{const refresh=()=>setPreferences(readPreferences(userId));refresh();window.addEventListener(preferenceEvent,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(preferenceEvent,refresh);window.removeEventListener('storage',refresh)}},[userId]);
 return preferences;
}
