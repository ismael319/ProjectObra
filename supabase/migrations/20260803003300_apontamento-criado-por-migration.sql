-- ============================================================
-- MIGRAÇÃO: Registra quem fez cada apontamento
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Guarda quem lançou cada registro de apontamentos_diarios. criado_por_nome
-- é uma cópia do email no momento do lançamento (mesmo padrão já usado em
-- empresa_nome/lideranca_nome/etc. — não depende de join nem muda se o
-- usuário depois trocar de email), pra telas de consulta/exportação
-- mostrarem "Apontado por" sem precisar consultar user_profiles.
-- Registros já existentes ficam com esses campos em branco (não tem como
-- saber retroativamente quem lançou).

ALTER TABLE public.apontamentos_diarios ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id);
ALTER TABLE public.apontamentos_diarios ADD COLUMN IF NOT EXISTS criado_por_nome text;
