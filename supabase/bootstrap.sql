-- Run only after the migration and after creating the Admin in Supabase Auth.
-- Replace the all-zero UUID with the actual Auth User ID. Do not put passwords here.
select public.bootstrap_shop(
 gen_random_uuid(),
 '00000000-0000-0000-0000-000000000000'::uuid,
 'Shop Admin',
 '{"name":"Macqul Mobile Repairing","phone":"","address":"","currency":"USD","timezone":"Africa/Nairobi","dateFormat":"YYYY-MM-DD","prefix":"MR","next":1,"promised":2,"brands":"Samsung, Apple, Tecno, Infinix, Xiaomi","issues":"Screen, Battery, Charging, Other","methods":"Cash, Mobile Money","categories":"Rent, Electricity, Internet, Transport, Other","header":"Thank you for choosing us.","footer":"Please bring this receipt for collection.","terms":"Please check your device on collection. Keep a backup of your data.","warranty":"Confirm the shop warranty before use.","compact":true}'::jsonb
);
