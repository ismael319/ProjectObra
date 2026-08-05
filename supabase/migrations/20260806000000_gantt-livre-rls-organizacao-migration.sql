-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Corrige um vazamento cross-tenant no Gantt Livre: as tabelas scenarios/
-- equipes/gantt_atividades/paradas nunca tiveram organizacao_id. A única
-- proteção que já existiu foi "só quem é da organização piloto"
-- (multi-tenant-fase1-migration.sql), depois trocada por "só quem tem o
-- módulo engenharia contratado" (pendentes-consolidado-migration.sql,
-- seção 4.5) SEM adicionar isolamento por dono — a política de leitura/
-- escrita continuou `FOR ALL USING (true)`. Resultado: hoje, qualquer
-- usuário autenticado de QUALQUER organização com o módulo engenharia
-- contratado lê e escreve os cenários de TODAS as organizações (via
-- chamada direta ao Supabase, nem precisa passar pela tela).
--
-- Como essas 4 tabelas nunca saíram do gate "só organização piloto" até a
-- troca pro gate por módulo, todo dado existente hoje pertence à
-- organização piloto — o backfill abaixo usa organizacao_piloto_id() com
-- segurança (não é um chute).
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. scenarios ganha organizacao_id ============

ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS organizacao_id uuid REFERENCES public.organizacoes(id);

UPDATE public.scenarios SET organizacao_id = public.organizacao_piloto_id() WHERE organizacao_id IS NULL;

ALTER TABLE public.scenarios ALTER COLUMN organizacao_id SET NOT NULL;
-- Novo cenário criado pela tela já nasce com o dono certo, sem precisar
-- que o código do app passe organizacao_id explicitamente em cada INSERT
-- (há vários pontos de criação em src/lib/gantt/store.ts — criar um novo,
-- duplicar, importar; um DEFAULT no banco garante que nenhum esqueça).
ALTER TABLE public.scenarios ALTER COLUMN organizacao_id SET DEFAULT public.user_organizacao();

-- ============ 2. Políticas: scenarios ============
-- equipes/gantt_atividades/paradas não têm organizacao_id próprio — escopo
-- via join até scenarios.organizacao_id. Mesmo padrão de leitura ampla +
-- escrita só Edição já usado no resto do app.

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.scenarios;
DROP POLICY IF EXISTS "Leitura scenarios da organizacao" ON public.scenarios;
CREATE POLICY "Leitura scenarios da organizacao" ON public.scenarios
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Edicao gerencia scenarios" ON public.scenarios;
CREATE POLICY "Edicao gerencia scenarios" ON public.scenarios
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'));

-- ============ 3. Políticas: equipes ============

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.equipes;
DROP POLICY IF EXISTS "Leitura equipes da organizacao" ON public.equipes;
CREATE POLICY "Leitura equipes da organizacao" ON public.equipes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia equipes" ON public.equipes;
CREATE POLICY "Edicao gerencia equipes" ON public.equipes
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ))
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ));

-- ============ 4. Políticas: gantt_atividades ============

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.gantt_atividades;
DROP POLICY IF EXISTS "Leitura gantt_atividades da organizacao" ON public.gantt_atividades;
CREATE POLICY "Leitura gantt_atividades da organizacao" ON public.gantt_atividades
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia gantt_atividades" ON public.gantt_atividades;
CREATE POLICY "Edicao gerencia gantt_atividades" ON public.gantt_atividades
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ))
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ));

-- ============ 5. Políticas: paradas ============

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.paradas;
DROP POLICY IF EXISTS "Leitura paradas da organizacao" ON public.paradas;
CREATE POLICY "Leitura paradas da organizacao" ON public.paradas
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao()
  ));

DROP POLICY IF EXISTS "Edicao gerencia paradas" ON public.paradas;
CREATE POLICY "Edicao gerencia paradas" ON public.paradas
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ))
  WITH CHECK (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.scenarios s WHERE s.id = scenario_id AND s.organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'
  ));

-- ============ 6. Fecha o acesso anônimo solto ============
-- A migration original dava GRANT a anon (nunca revogado de fato — o
-- revoke ficou só comentado em multi-tenant-fase1-migration.sql).

REVOKE ALL ON public.scenarios, public.equipes, public.gantt_atividades, public.paradas FROM anon;

NOTIFY pgrst, 'reload schema';
