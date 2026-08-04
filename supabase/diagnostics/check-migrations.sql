-- Só leitura — confirma se as migrações necessárias antes de
-- dashboard-visao-geral-migration.sql já rodaram neste projeto Supabase.
-- Cole no SQL Editor e rode; cada linha do resultado deve mostrar existe = true.

SELECT 'rls-migration.sql (user_papel)' AS migracao,
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'user_papel'
       ) AS existe
UNION ALL
SELECT 'multi-tenant-fase1-migration.sql (organizacoes)',
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'organizacoes'
       )
UNION ALL
SELECT 'multi-tenant-fase1-migration.sql (user_organizacao)',
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'user_organizacao'
       )
UNION ALL
SELECT 'multi-tenant-fase1-migration.sql (is_super_admin)',
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
       );
