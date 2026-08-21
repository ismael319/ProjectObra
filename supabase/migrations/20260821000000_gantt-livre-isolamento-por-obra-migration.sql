-- ============================================================
-- MIGRAÇÃO: Isola o Gantt Livre por obra
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Hoje `scenarios` (e, por tabela, `equipes`, `gantt_atividades`, `paradas`)
-- não tem NENHUM vínculo com projeto/organização — a RLS de todas é
-- "USING (true)" pra qualquer authenticated (ver src/lib/gantt/migrations.sql).
-- Resultado: todo cenário do Gantt Livre aparece em TODAS as obras de TODAS
-- as organizações que usam a plataforma, misturado.
--
-- Único cliente que já usou o Gantt Livre até hoje é a BDR CONSTRUART, obra
-- "FS CNP" (mesmos ids já usados em 20260819010000_separa_pessoas_por_obra.sql)
-- — todo cenário existente é atribuído a ela. Daqui pra frente, cenário novo
-- nasce sempre vinculado à obra ativa no momento da criação.
--
-- `equipes`, `gantt_atividades` e `paradas` continuam só com scenario_id (não
-- denormaliza projeto_id/organizacao_id nelas) — a obra é sempre resolvida
-- via join com `scenarios`, mesmo padrão de FK em cascata que essas tabelas
-- já usam entre si.
-- ============================================================

-- ============ 1. COLUNAS NOVAS (nullable até o backfill terminar) ============

ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS organizacao_id uuid;

-- ============ 2. BACKFILL: todo cenário existente -> BDR CONSTRUART / FS CNP ============

DO $$
DECLARE
  v_bdr_org uuid := 'a34ef264-d8c6-426f-aebe-1544f8bf5b92';
  v_bdr_obra uuid := '8dbc4b87-0419-4839-a37a-a97d6f746b38';
BEGIN
  -- Confere que o id da obra "FS CNP" realmente é esse e pertence à BDR —
  -- aborta a migração inteira (não só o UPDATE) se o cadastro mudou desde
  -- 20260819010000, em vez de aplicar backfill errado silenciosamente.
  IF NOT EXISTS (
    SELECT 1 FROM public.projetos WHERE id = v_bdr_obra AND organizacao_id = v_bdr_org AND nome = 'FS CNP'
  ) THEN
    RAISE EXCEPTION 'Obra FS CNP (id %) não encontrada na organização % — confira os ids antes de rodar o backfill.', v_bdr_obra, v_bdr_org;
  END IF;

  UPDATE public.scenarios
    SET projeto_id = v_bdr_obra, organizacao_id = v_bdr_org
    WHERE projeto_id IS NULL;
END $$;

-- ============ 3. NOT NULL + FK COMPOSTA (garante que a obra pertence mesmo à organização do cenário) ============

ALTER TABLE public.scenarios ALTER COLUMN projeto_id SET NOT NULL;
ALTER TABLE public.scenarios ALTER COLUMN organizacao_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scenarios_projeto_organizacao_fkey') THEN
    ALTER TABLE public.scenarios ADD CONSTRAINT scenarios_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scenarios_projeto_idx ON public.scenarios (projeto_id);
CREATE INDEX IF NOT EXISTS scenarios_organizacao_idx ON public.scenarios (organizacao_id);

-- ============ 4. RLS: exige user_ve_projeto(projeto_id), mesmo padrão do módulo Pessoas/Apontamento ============
-- Módulo do Gantt Livre é "engenharia" (ver src/lib/nav-config.ts, item "Gantt Livre").

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.scenarios;

DROP POLICY IF EXISTS "Leitura scenarios da obra" ON public.scenarios;
CREATE POLICY "Leitura scenarios da obra" ON public.scenarios
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('engenharia')));

DROP POLICY IF EXISTS "Escrita scenarios da obra" ON public.scenarios;
CREATE POLICY "Escrita scenarios da obra" ON public.scenarios
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('engenharia') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('engenharia') = 'edicao'));

-- ============ 5. RLS de equipes/gantt_atividades/paradas: obra resolvida via join com scenarios ============

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.equipes;
DROP POLICY IF EXISTS "Leitura equipes da obra" ON public.equipes;
CREATE POLICY "Leitura equipes da obra" ON public.equipes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = equipes.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_ve_modulo('engenharia')
  ));

DROP POLICY IF EXISTS "Escrita equipes da obra" ON public.equipes;
CREATE POLICY "Escrita equipes da obra" ON public.equipes
  FOR ALL TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = equipes.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ))
  WITH CHECK (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = equipes.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ));

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.gantt_atividades;
DROP POLICY IF EXISTS "Leitura gantt_atividades da obra" ON public.gantt_atividades;
CREATE POLICY "Leitura gantt_atividades da obra" ON public.gantt_atividades
  FOR SELECT TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = gantt_atividades.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_ve_modulo('engenharia')
  ));

DROP POLICY IF EXISTS "Escrita gantt_atividades da obra" ON public.gantt_atividades;
CREATE POLICY "Escrita gantt_atividades da obra" ON public.gantt_atividades
  FOR ALL TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = gantt_atividades.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ))
  WITH CHECK (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = gantt_atividades.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ));

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.paradas;
DROP POLICY IF EXISTS "Leitura paradas da obra" ON public.paradas;
CREATE POLICY "Leitura paradas da obra" ON public.paradas
  FOR SELECT TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = paradas.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_ve_modulo('engenharia')
  ));

DROP POLICY IF EXISTS "Escrita paradas da obra" ON public.paradas;
CREATE POLICY "Escrita paradas da obra" ON public.paradas
  FOR ALL TO authenticated
  USING (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = paradas.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ))
  WITH CHECK (is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s
    WHERE s.id = paradas.scenario_id AND s.organizacao_id = user_organizacao() AND user_ve_projeto(s.projeto_id) AND user_papel_modulo('engenharia') = 'edicao'
  ));

NOTIFY pgrst, 'reload schema';
