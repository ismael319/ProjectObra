-- ============================================================
-- CORREÇÃO: "function gen_random_bytes(integer) does not exist"
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- As funções de convite (criar_convite, revogar/regenerar token de
-- apresentação, convites multi-organização — ver hardening-acesso-
-- organizacoes.sql e multi-organizacoes-fase2.sql) usam gen_random_bytes()/
-- digest(), da extensão pgcrypto. Elas foram endurecidas com
-- `SET search_path = public, pg_temp` (proteção contra search_path
-- injection) — mas no Supabase o pgcrypto normalmente é instalado no schema
-- "extensions", não em "public". Com o search_path restrito a só public,
-- essas funções deixam de enxergar gen_random_bytes()/digest(), mesmo a
-- extensão estando instalada — daí o erro "function gen_random_bytes(integer)
-- does not exist" ao clicar em "Convidar usuário".
--
-- Fix: move a extensão pgcrypto pra dentro do schema public (idempotente —
-- se já estiver lá, não faz nada). Não precisa tocar em cada função uma a
-- uma: todas que já assumem search_path=public passam a enxergar o
-- pgcrypto automaticamente.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    IF (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pgcrypto') <> 'public' THEN
      ALTER EXTENSION pgcrypto SET SCHEMA public;
    END IF;
  ELSE
    CREATE EXTENSION pgcrypto WITH SCHEMA public;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
