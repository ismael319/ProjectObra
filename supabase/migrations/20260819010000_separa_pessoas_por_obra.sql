-- ============================================================
-- MIGRAÇÃO: Separa o módulo Pessoas (Administração) por obra
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Hoje funcionários, documentos, demissões, ponto importado e o snapshot de
-- efetivo diário só são isolados por organizacao_id — uma empresa com mais
-- de uma obra vê tudo misturado (Cadastro e Ponto em `efetivoDoDia()`, por
-- exemplo, somam TODOS os funcionários da empresa, mesmo tendo recebido
-- `projetoId` como parâmetro).
--
-- `funcionarios.projeto_id` já existia (nullable, ver
-- 20260803003800_administracao-funcionarios-projeto-migration.sql) mas não
-- era usado por nenhuma RLS nem filtro de listagem — só decorativo/pro
-- Histograma. Esta migration:
--   1. Denormaliza projeto_id nas tabelas que hoje só têm organizacao_id
--      (documentos_funcionario, demissoes, pontos_importados,
--      rh_efetivo_ponto_diario, efetivo_importacoes) — mesmo padrão já usado
--      pra organizacao_id nessas tabelas.
--   2. Faz backfill: a BDR CONSTRUART tem hoje 2 obras cadastradas, mas só
--      "FS CNP" já lançou dados de Pessoal — todo o histórico existente é
--      atribuído a ela. Outras organizações com só uma obra recebem
--      backfill automático pra essa obra única; organizações com mais de
--      uma obra e dados ambíguos ficam com projeto_id nulo (ficam ocultas
--      pela RLS pra quem não é Dono da Plataforma, até alguém corrigir
--      manualmente — mais seguro que adivinhar errado).
--   3. Troca as políticas de leitura/escrita pra exigir
--      user_ve_projeto(projeto_id), mesmo padrão já usado no módulo
--      Apontamento/Fundação (20260813040000_ativa-rls-legado-por-obra.sql).
--   4. Remove `funcionarios.obra_codigo` (texto livre, redundante e
--      dessincronizado do projeto_id de verdade) — decisão confirmada: só
--      o campo "Projeto" (FK real) continua existindo.
--
-- Cargos, setores, grupos e tipos de documento CONTINUAM por empresa
-- (decisão confirmada: são catálogos reaproveitados entre obras).
-- ============================================================

-- ============ 1. COLUNAS NOVAS (sem FK ainda — precisa existir antes do backfill) ============

ALTER TABLE public.documentos_funcionario ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.demissoes ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.pontos_importados ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.rh_efetivo_ponto_diario ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.efetivo_importacoes ADD COLUMN IF NOT EXISTS projeto_id uuid;

-- ============ 2. BACKFILL (BDR CONSTRUART -> FS CNP, + regra genérica de obra única) ============

DO $$
DECLARE
  v_bdr_org uuid := 'a34ef264-d8c6-426f-aebe-1544f8bf5b92';
  v_bdr_obra uuid := '8dbc4b87-0419-4839-a37a-a97d6f746b38';
BEGIN
  -- 1. funcionarios: promove projeto_id de decorativo a fonte de verdade.
  UPDATE public.funcionarios SET projeto_id = v_bdr_obra
    WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;

  -- Backfill genérico: qualquer outra organização que hoje tenha
  -- exatamente UMA obra cadastrada tem o vínculo óbvio.
  UPDATE public.funcionarios f SET projeto_id = p.unica
    FROM (
      SELECT organizacao_id, (array_agg(id))[1] AS unica, COUNT(*) AS total
      FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1
    ) p
    WHERE f.organizacao_id = p.organizacao_id AND f.projeto_id IS NULL;

  -- 2. Tabelas dependentes de funcionário: herdam o projeto_id do pai.
  UPDATE public.documentos_funcionario df SET projeto_id = f.projeto_id
    FROM public.funcionarios f WHERE df.funcionario_id = f.id AND df.projeto_id IS NULL;

  UPDATE public.demissoes d SET projeto_id = f.projeto_id
    FROM public.funcionarios f WHERE d.funcionario_origem_id = f.id AND d.projeto_id IS NULL;

  UPDATE public.pontos_importados pi SET projeto_id = f.projeto_id
    FROM public.funcionarios f WHERE pi.funcionario_id = f.id AND pi.projeto_id IS NULL;

  -- 3. Tabelas sem link de funcionário (agregados/lotes de import): mesmo
  --    backfill genérico de "obra única" + explícito da BDR.
  UPDATE public.demissoes SET projeto_id = v_bdr_obra
    WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.pontos_importados SET projeto_id = v_bdr_obra
    WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.rh_efetivo_ponto_diario SET projeto_id = v_bdr_obra
    WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.efetivo_importacoes SET projeto_id = v_bdr_obra
    WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;

  UPDATE public.demissoes d SET projeto_id = p.unica
    FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p
    WHERE d.organizacao_id = p.organizacao_id AND d.projeto_id IS NULL;
  UPDATE public.pontos_importados pi SET projeto_id = p.unica
    FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p
    WHERE pi.organizacao_id = p.organizacao_id AND pi.projeto_id IS NULL;
  UPDATE public.rh_efetivo_ponto_diario r SET projeto_id = p.unica
    FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p
    WHERE r.organizacao_id = p.organizacao_id AND r.projeto_id IS NULL;
  UPDATE public.efetivo_importacoes e SET projeto_id = p.unica
    FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p
    WHERE e.organizacao_id = p.organizacao_id AND e.projeto_id IS NULL;
END $$;

-- ============ 3. FK COMPOSTA (projeto_id, organizacao_id) — valida os dados já preenchidos ============

-- funcionarios já tinha projeto_id com FK simples (ON DELETE SET NULL) —
-- troca pela composta, que garante que a obra escolhida pertence mesmo à
-- empresa do funcionário.
ALTER TABLE public.funcionarios DROP CONSTRAINT IF EXISTS funcionarios_projeto_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funcionarios_projeto_organizacao_fkey') THEN
    ALTER TABLE public.funcionarios ADD CONSTRAINT funcionarios_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_funcionario_projeto_organizacao_fkey') THEN
    ALTER TABLE public.documentos_funcionario ADD CONSTRAINT documentos_funcionario_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demissoes_projeto_organizacao_fkey') THEN
    ALTER TABLE public.demissoes ADD CONSTRAINT demissoes_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pontos_importados_projeto_organizacao_fkey') THEN
    ALTER TABLE public.pontos_importados ADD CONSTRAINT pontos_importados_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_efetivo_ponto_diario_projeto_organizacao_fkey') THEN
    ALTER TABLE public.rh_efetivo_ponto_diario ADD CONSTRAINT rh_efetivo_ponto_diario_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'efetivo_importacoes_projeto_organizacao_fkey') THEN
    ALTER TABLE public.efetivo_importacoes ADD CONSTRAINT efetivo_importacoes_projeto_organizacao_fkey
      FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documentos_funcionario_projeto_idx ON public.documentos_funcionario (projeto_id);
CREATE INDEX IF NOT EXISTS demissoes_projeto_idx ON public.demissoes (projeto_id);
CREATE INDEX IF NOT EXISTS pontos_importados_projeto_idx ON public.pontos_importados (projeto_id);
CREATE INDEX IF NOT EXISTS rh_efetivo_ponto_diario_projeto_idx ON public.rh_efetivo_ponto_diario (projeto_id);
CREATE INDEX IF NOT EXISTS efetivo_importacoes_projeto_idx ON public.efetivo_importacoes (projeto_id);

-- ============ 4. REMOVE obra_codigo (texto livre, substituído pelo projeto_id) ============

ALTER TABLE public.funcionarios DROP COLUMN IF EXISTS obra_codigo;

-- ============ 5. RLS: exige user_ve_projeto(projeto_id), mesmo padrão do módulo Apontamento ============

DROP POLICY IF EXISTS "Leitura funcionarios da propria empresa" ON public.funcionarios;
CREATE POLICY "Leitura funcionarios da obra" ON public.funcionarios
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia funcionarios" ON public.funcionarios;
CREATE POLICY "Escrita funcionarios da obra" ON public.funcionarios
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Leitura documentos_funcionario da propria empresa" ON public.documentos_funcionario;
CREATE POLICY "Leitura documentos_funcionario da obra" ON public.documentos_funcionario
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia documentos_funcionario" ON public.documentos_funcionario;
CREATE POLICY "Escrita documentos_funcionario da obra" ON public.documentos_funcionario
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Leitura demissoes da propria empresa" ON public.demissoes;
CREATE POLICY "Leitura demissoes da obra" ON public.demissoes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia demissoes" ON public.demissoes;
CREATE POLICY "Escrita demissoes da obra" ON public.demissoes
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Leitura pontos_importados da propria empresa" ON public.pontos_importados;
CREATE POLICY "Leitura pontos_importados da obra" ON public.pontos_importados
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia pontos_importados" ON public.pontos_importados;
CREATE POLICY "Escrita pontos_importados da obra" ON public.pontos_importados
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Leitura rh_efetivo_ponto_diario da propria empresa" ON public.rh_efetivo_ponto_diario;
CREATE POLICY "Leitura rh_efetivo_ponto_diario da obra" ON public.rh_efetivo_ponto_diario
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao gerencia rh_efetivo_ponto_diario" ON public.rh_efetivo_ponto_diario;
CREATE POLICY "Escrita rh_efetivo_ponto_diario da obra" ON public.rh_efetivo_ponto_diario
  FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

DROP POLICY IF EXISTS "Leitura efetivo_importacoes da propria empresa" ON public.efetivo_importacoes;
CREATE POLICY "Leitura efetivo_importacoes da obra" ON public.efetivo_importacoes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('administracao')));

DROP POLICY IF EXISTS "Edicao registra efetivo_importacoes" ON public.efetivo_importacoes;
CREATE POLICY "Escrita efetivo_importacoes da obra" ON public.efetivo_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('administracao') = 'edicao'));

NOTIFY pgrst, 'reload schema';
