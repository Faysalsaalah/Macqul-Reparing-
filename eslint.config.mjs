import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({baseDirectory:import.meta.dirname});
const config = [...compat.extends('next/core-web-vitals','next/typescript'),{ignores:['next-env.d.ts','.next/**','.next-production/**','.next-recovery-*/**','stitch_macqul_repair_shop_dashboard/**']}];
export default config;
