-- ============================================================
-- MIGRAÇÃO: funcionarios.ativo (soft-delete) + histórico de importações
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS administracao-schema-migration.sql
-- ============================================================
-- Antes, "Desligar" apagava a linha de funcionarios — e como
-- documentos_funcionario tem ON DELETE CASCADE, isso também apagava o
-- histórico de ASO/NRs da pessoa pra sempre. Passa a usar o mesmo padrão
-- `ativo boolean` já usado em rh_setores/rh_cargos/rh_encarregados/
-- rh_grupos: funcionário desligado continua na tabela (documentos
-- preservados, dá pra reativar), só marcado ativo=false. A aba
-- "Funcionários" mostra todo mundo; Dashboard/Efetivo do Dia/Documentação
-- continuam contando só ativo=true.
-- ============================================================

ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS funcionarios_ativo_idx ON public.funcionarios (organizacao_id, ativo);

-- ============ Histórico de importações de Controle de Efetivo ============
-- Só um registro por importação (nome do arquivo, quando, quantas linhas)
-- pra mostrar "última importação" na tela — não é uma tabela de rollback
-- como sienge_importacoes, é só pra exibição.

CREATE TABLE IF NOT EXISTS public.efetivo_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  arquivo_nome text NOT NULL,
  total_linhas integer NOT NULL,
  novos integer NOT NULL,
  atualizados integer NOT NULL,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS efetivo_importacoes_organizacao_idx ON public.efetivo_importacoes (organizacao_id, importado_em DESC);

ALTER TABLE public.efetivo_importacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.efetivo_importacoes TO authenticated;

DROP POLICY IF EXISTS "Leitura efetivo_importacoes da propria empresa" ON public.efetivo_importacoes;
CREATE POLICY "Leitura efetivo_importacoes da propria empresa" ON public.efetivo_importacoes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao registra efetivo_importacoes" ON public.efetivo_importacoes;
CREATE POLICY "Edicao registra efetivo_importacoes" ON public.efetivo_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('administracao') AND public.user_papel() = 'edicao'));
