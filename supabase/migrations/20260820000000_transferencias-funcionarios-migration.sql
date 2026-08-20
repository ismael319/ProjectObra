-- ============================================================
-- MIGRAÇÃO: Transferência de funcionário entre obras (módulo Pessoas)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260819010000_separa_pessoas_por_obra.sql
-- (usa user_ve_projeto(), user_papel_modulo(), user_organizacao())
-- ============================================================
-- Hoje a única forma de mudar a obra de um funcionário é editando
-- funcionarios.projeto_id direto no formulário, sem deixar rastro de "saiu
-- da obra X e foi para a obra Y". Este módulo cria uma aba "Transferências"
-- (mesmo espírito de "Demissões"): grava um histórico ANTES de mover o
-- funcionário, na mesma ordem defensiva já usada em desligarFuncionario —
-- se algo falhar entre os dois passos, o pior caso é uma linha de histórico
-- "solta", nunca perder o vínculo sem deixar rastro.
--
-- Campos denormalizados (matricula/nome/cargo_nome/setor_nome) seguem o
-- mesmo padrão de `demissoes`: depois da transferência, funcionarios.projeto_id
-- já aponta pra obra de destino, então o histórico precisa da sua própria
-- cópia pra continuar aparecendo corretamente na obra de origem.
--
-- Leitura só exige visibilidade da obra de ORIGEM (decisão confirmada) —
-- quem só tem acesso à obra de destino não vê o registro de quem chegou de
-- outra obra por aqui. Só INSERT (sem UPDATE/DELETE), mesmo padrão de
-- efetivo_importacoes: é um log de histórico, não um cadastro editável.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  matricula text NOT NULL,
  nome text NOT NULL,
  cargo_nome text,
  setor_nome text,
  projeto_origem_id uuid NOT NULL,
  projeto_destino_id uuid NOT NULL,
  data_transferencia date NOT NULL,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transferencias_origem_organizacao_fkey') THEN
    ALTER TABLE public.transferencias ADD CONSTRAINT transferencias_origem_organizacao_fkey
      FOREIGN KEY (projeto_origem_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transferencias_destino_organizacao_fkey') THEN
    ALTER TABLE public.transferencias ADD CONSTRAINT transferencias_destino_organizacao_fkey
      FOREIGN KEY (projeto_destino_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transferencias_organizacao_idx ON public.transferencias (organizacao_id);
CREATE INDEX IF NOT EXISTS transferencias_projeto_origem_idx ON public.transferencias (projeto_origem_id);

ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.transferencias TO authenticated;

DROP POLICY IF EXISTS "Leitura transferencias da obra" ON public.transferencias;
CREATE POLICY "Leitura transferencias da obra" ON public.transferencias
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_origem_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Escrita transferencias da obra" ON public.transferencias;
CREATE POLICY "Escrita transferencias da obra" ON public.transferencias
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_origem_id) AND user_papel_modulo('administracao') = 'edicao'));

NOTIFY pgrst, 'reload schema';
