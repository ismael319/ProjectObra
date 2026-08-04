-- ============================================================
-- MIGRAÇÃO: funcionarios.foto_url (foto do funcionário)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS administracao-schema-migration.sql
-- ============================================================
-- Guarda a URL da foto do funcionário hospedada no servidor de nuvem da
-- empresa. Só a URL (texto) é persistida aqui; a foto em si continua no
-- armazenamento da empresa. O app usa esse campo pra mostrar um link
-- "Ver foto" no formulário do funcionário.
-- Nullable: nem todo funcionário tem foto cadastrada.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS foto_url text;

NOTIFY pgrst, 'reload schema';
