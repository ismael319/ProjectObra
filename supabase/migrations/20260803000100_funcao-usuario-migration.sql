-- ============================================================
-- MIGRAÇÃO: Campo "Função" por usuário (descrição do perfil)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS acesso-3-niveis-migration.sql
-- ============================================================
-- "Função" é só texto livre pra descrever o cargo/perfil da pessoa (ex.:
-- "Engenheiro Civil", "Mestre de Obras", "Técnico de Segurança") — não tem
-- NENHUM efeito de permissão, é puramente informativo. Diferente do nível de
-- acesso (papel: edicao/visualizacao/insercao_pontual), que continua sendo
-- gerido só por edicao/Dono.
-- ============================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS funcao text;

-- ============ Autoatualização segura ============
-- A política de UPDATE de user_profiles hoje só libera edicao/Dono (ver
-- "Fecha a brecha de auto-escalação" em user-approval-migration.sql) — de
-- propósito, pra ninguém conseguir se autopromover mudando o próprio papel.
-- Em vez de reabrir um UPDATE genérico na própria linha (o que reabriria
-- essa brecha), esta função deixa SÓ a coluna "funcao" gravável pelo próprio
-- usuário — SECURITY DEFINER contorna a RLS por dentro, mas o escopo da
-- função é fixo (só funcao, só a própria linha), então não há como escalar
-- nada por aqui.
CREATE OR REPLACE FUNCTION public.atualizar_minha_funcao(nova_funcao text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_profiles SET funcao = nullif(trim(nova_funcao), '') WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_minha_funcao(text) TO authenticated;
