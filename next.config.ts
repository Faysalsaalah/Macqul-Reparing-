import type { NextConfig } from 'next';
const config:NextConfig={poweredByHeader:false,distDir:process.env.NODE_ENV==='production'?'.next-production':'.next'};
export default config;
