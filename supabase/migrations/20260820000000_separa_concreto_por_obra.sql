-- ============================================================
-- MIGRAÇÃO: Separa o módulo Concreto (Qualidade) por obra
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Hoje TODAS as 13 tabelas do Concreto (fornecedores, traços, cargas,
-- laboratórios, config. de ensaio, contador de código de rastreabilidade,
-- corpos de prova, ensaios, setores/áreas/etapas próprios do Concreto e
-- destinos de carga) só são isoladas por organizacao_id — uma empresa com
-- mais de uma obra vê tudo misturado: traços, fornecedores, cargas lançadas
-- e o próprio código de rastreabilidade (CC-2026-0001) são compartilhados
-- entre obras diferentes da mesma empresa.
--
-- Decisões confirmadas com o usuário:
--   - TODAS as 13 tabelas passam a ser isoladas por obra (diferente do
--     módulo Pessoas, aqui nada fica "catálogo de empresa reaproveitado").
--   - O código de rastreabilidade reinicia a numeração em cada obra nova E
--     passa a identificar a obra no meio do código: de "CC-2026-0001" (ou
--     "SIGLA-CC-2026-0001") para "CC-{código da obra}-2026-0001" (ex.:
--     "CC-PRJ-002-2026-0001").
--   - Backfill: só a obra "FS CNP" (8dbc4b87-0419-4839-a37a-a97d6f746b38) da
--     BDR CONSTRUART (a34ef264-d8c6-426f-aebe-1544f8bf5b92) tem dados de
--     Concreto lançados até agora — todo o histórico existente (incluindo os
--     contadores de código já usados, pra não gerar duplicata) é atribuído a
--     ela. Outras organizações com só uma obra recebem backfill automático;
--     organizações com mais de uma obra e dados ambíguos ficam com
--     projeto_id nulo (viram invisíveis pela RLS pra quem não é Dono da
--     Plataforma, até alguém corrigir manualmente).
--
-- Achado à parte, corrigido junto: `lib/importer-db.ts` (reimportação de
-- histórico) apagava TODAS as cargas da ORGANIZAÇÃO inteira antes de
-- reimportar — com o projeto_id em mãos, o app passa a escopar esse DELETE
-- pela obra também (ver commit do frontend).
-- ============================================================

-- ============ 1. COLUNAS NOVAS (sem FK/constraint ainda) ============

ALTER TABLE public.fornecedores_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.tracos_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.laboratorios ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.corpos_prova ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.ensaios_corpos_prova ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.setores_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.areas_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.etapas_concreto ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.destinos_carga ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.organizacoes_config_ensaio ADD COLUMN IF NOT EXISTS projeto_id uuid;
ALTER TABLE public.codigo_rastreabilidade_contadores ADD COLUMN IF NOT EXISTS projeto_id uuid;

-- ============ 2. BACKFILL ============

DO $$
DECLARE
  v_bdr_org uuid := 'a34ef264-d8c6-426f-aebe-1544f8bf5b92';
  v_bdr_obra uuid := '8dbc4b87-0419-4839-a37a-a97d6f746b38';
BEGIN
  -- BDR CONSTRUART: tudo pra FS CNP.
  UPDATE public.fornecedores_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.tracos_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.cargas_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.laboratorios SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.corpos_prova SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.ensaios_corpos_prova SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.setores_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.areas_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.etapas_concreto SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.destinos_carga SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.organizacoes_config_ensaio SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;
  UPDATE public.codigo_rastreabilidade_contadores SET projeto_id = v_bdr_obra WHERE organizacao_id = v_bdr_org AND projeto_id IS NULL;

  -- Backfill genérico: qualquer outra organização com exatamente UMA obra
  -- cadastrada tem o vínculo óbvio.
  UPDATE public.fornecedores_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.tracos_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.cargas_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.laboratorios t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.corpos_prova t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.ensaios_corpos_prova t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.setores_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.areas_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.etapas_concreto t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.destinos_carga t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.organizacoes_config_ensaio t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
  UPDATE public.codigo_rastreabilidade_contadores t SET projeto_id = p.unica FROM (SELECT organizacao_id, (array_agg(id))[1] AS unica FROM public.projetos GROUP BY organizacao_id HAVING COUNT(*) = 1) p WHERE t.organizacao_id = p.organizacao_id AND t.projeto_id IS NULL;
END $$;

-- ============ 3. FK COMPOSTA (projeto_id, organizacao_id) ============

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fornecedores_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.fornecedores_concreto ADD CONSTRAINT fornecedores_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracos_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.tracos_concreto ADD CONSTRAINT tracos_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cargas_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.cargas_concreto ADD CONSTRAINT cargas_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laboratorios_projeto_organizacao_fkey') THEN
    ALTER TABLE public.laboratorios ADD CONSTRAINT laboratorios_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corpos_prova_projeto_organizacao_fkey') THEN
    ALTER TABLE public.corpos_prova ADD CONSTRAINT corpos_prova_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ensaios_corpos_prova_projeto_organizacao_fkey') THEN
    ALTER TABLE public.ensaios_corpos_prova ADD CONSTRAINT ensaios_corpos_prova_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'setores_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.setores_concreto ADD CONSTRAINT setores_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.areas_concreto ADD CONSTRAINT areas_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'etapas_concreto_projeto_organizacao_fkey') THEN
    ALTER TABLE public.etapas_concreto ADD CONSTRAINT etapas_concreto_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'destinos_carga_projeto_organizacao_fkey') THEN
    ALTER TABLE public.destinos_carga ADD CONSTRAINT destinos_carga_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacoes_config_ensaio_projeto_organizacao_fkey') THEN
    ALTER TABLE public.organizacoes_config_ensaio ADD CONSTRAINT organizacoes_config_ensaio_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'codigo_rastreabilidade_contadores_projeto_organizacao_fkey') THEN
    ALTER TABLE public.codigo_rastreabilidade_contadores ADD CONSTRAINT codigo_rastreabilidade_contadores_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS fornecedores_concreto_projeto_idx ON public.fornecedores_concreto (projeto_id);
CREATE INDEX IF NOT EXISTS tracos_concreto_projeto_idx ON public.tracos_concreto (projeto_id);
CREATE INDEX IF NOT EXISTS cargas_concreto_projeto_data_idx ON public.cargas_concreto (projeto_id, data);
CREATE INDEX IF NOT EXISTS laboratorios_projeto_idx ON public.laboratorios (projeto_id);
CREATE INDEX IF NOT EXISTS corpos_prova_projeto_idx ON public.corpos_prova (projeto_id);
CREATE INDEX IF NOT EXISTS ensaios_corpos_prova_projeto_idx ON public.ensaios_corpos_prova (projeto_id);
CREATE INDEX IF NOT EXISTS setores_concreto_projeto_idx ON public.setores_concreto (projeto_id);
CREATE INDEX IF NOT EXISTS areas_concreto_projeto_idx ON public.areas_concreto (projeto_id);
CREATE INDEX IF NOT EXISTS etapas_concreto_projeto_idx ON public.etapas_concreto (projeto_id);
CREATE INDEX IF NOT EXISTS destinos_carga_projeto_idx ON public.destinos_carga (projeto_id);

-- ============ 4. CHAVES ÚNICAS: passam a incluir projeto_id ============

ALTER TABLE public.setores_concreto DROP CONSTRAINT IF EXISTS setores_concreto_organizacao_id_nome_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'setores_concreto_organizacao_projeto_nome_key') THEN
    ALTER TABLE public.setores_concreto ADD CONSTRAINT setores_concreto_organizacao_projeto_nome_key UNIQUE (organizacao_id, projeto_id, nome);
  END IF;
END $$;

ALTER TABLE public.areas_concreto DROP CONSTRAINT IF EXISTS areas_concreto_org_setor_nome_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_concreto_org_projeto_setor_nome_key') THEN
    ALTER TABLE public.areas_concreto ADD CONSTRAINT areas_concreto_org_projeto_setor_nome_key UNIQUE (organizacao_id, projeto_id, setor_concreto_id, nome);
  END IF;
END $$;

ALTER TABLE public.etapas_concreto DROP CONSTRAINT IF EXISTS etapas_concreto_organizacao_id_nome_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'etapas_concreto_organizacao_projeto_nome_key') THEN
    ALTER TABLE public.etapas_concreto ADD CONSTRAINT etapas_concreto_organizacao_projeto_nome_key UNIQUE (organizacao_id, projeto_id, nome);
  END IF;
END $$;

-- organizacoes_config_ensaio: PK era só organizacao_id (1 linha por empresa) -> (organizacao_id, projeto_id).
-- Só troca a PK se o backfill resolveu projeto_id em TODA linha — uma
-- organização com mais de uma obra e sem obra única não sabe qual usar,
-- prefere manter a coluna solta ali (a linha nunca vai bater no `AND
-- cfg.projeto_id = cp.projeto_id` da view, cai no default 28 dias) a travar
-- a migration inteira.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizacoes_config_ensaio WHERE projeto_id IS NULL) THEN
    ALTER TABLE public.organizacoes_config_ensaio DROP CONSTRAINT IF EXISTS organizacoes_config_ensaio_pkey;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacoes_config_ensaio_pkey') THEN
      ALTER TABLE public.organizacoes_config_ensaio ADD CONSTRAINT organizacoes_config_ensaio_pkey PRIMARY KEY (organizacao_id, projeto_id);
    END IF;
  END IF;
END $$;

-- codigo_rastreabilidade_contadores: PK era (organizacao_id, ano) -> (organizacao_id, projeto_id, ano). Mesma cautela acima.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.codigo_rastreabilidade_contadores WHERE projeto_id IS NULL) THEN
    ALTER TABLE public.codigo_rastreabilidade_contadores DROP CONSTRAINT IF EXISTS codigo_rastreabilidade_contadores_pkey;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'codigo_rastreabilidade_contadores_pkey') THEN
      ALTER TABLE public.codigo_rastreabilidade_contadores ADD CONSTRAINT codigo_rastreabilidade_contadores_pkey PRIMARY KEY (organizacao_id, projeto_id, ano);
    END IF;
  END IF;
END $$;

-- ============ 5. RLS ============

-- fornecedores_concreto
DROP POLICY IF EXISTS "Leitura fornecedores_concreto da propria empresa" ON public.fornecedores_concreto;
CREATE POLICY "Leitura fornecedores_concreto da obra" ON public.fornecedores_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia fornecedores_concreto" ON public.fornecedores_concreto;
CREATE POLICY "Escrita fornecedores_concreto da obra" ON public.fornecedores_concreto FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- tracos_concreto
DROP POLICY IF EXISTS "Leitura tracos_concreto da propria empresa" ON public.tracos_concreto;
CREATE POLICY "Leitura tracos_concreto da obra" ON public.tracos_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia tracos_concreto" ON public.tracos_concreto;
CREATE POLICY "Escrita tracos_concreto da obra" ON public.tracos_concreto FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- laboratorios
DROP POLICY IF EXISTS "Leitura laboratorios da propria empresa" ON public.laboratorios;
CREATE POLICY "Leitura laboratorios da obra" ON public.laboratorios FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia laboratorios" ON public.laboratorios;
CREATE POLICY "Escrita laboratorios da obra" ON public.laboratorios FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- setores_concreto
DROP POLICY IF EXISTS "Leitura setores_concreto da propria empresa" ON public.setores_concreto;
CREATE POLICY "Leitura setores_concreto da obra" ON public.setores_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia setores_concreto" ON public.setores_concreto;
CREATE POLICY "Escrita setores_concreto da obra" ON public.setores_concreto FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- areas_concreto
DROP POLICY IF EXISTS "Leitura areas_concreto da propria empresa" ON public.areas_concreto;
CREATE POLICY "Leitura areas_concreto da obra" ON public.areas_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia areas_concreto" ON public.areas_concreto;
CREATE POLICY "Escrita areas_concreto da obra" ON public.areas_concreto FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- etapas_concreto
DROP POLICY IF EXISTS "Leitura etapas_concreto da propria empresa" ON public.etapas_concreto;
CREATE POLICY "Leitura etapas_concreto da obra" ON public.etapas_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia etapas_concreto" ON public.etapas_concreto;
CREATE POLICY "Escrita etapas_concreto da obra" ON public.etapas_concreto FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- organizacoes_config_ensaio
DROP POLICY IF EXISTS "Leitura config_ensaio da propria empresa" ON public.organizacoes_config_ensaio;
CREATE POLICY "Leitura config_ensaio da obra" ON public.organizacoes_config_ensaio FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Edicao gerencia config_ensaio" ON public.organizacoes_config_ensaio;
CREATE POLICY "Escrita config_ensaio da obra" ON public.organizacoes_config_ensaio FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));

-- codigo_rastreabilidade_contadores — sem policy documentada antes (só a
-- função SECURITY DEFINER mexia); agora explícito porque o client
-- (importer-db.ts) lê/grava direto nela durante a importação em massa.
DROP POLICY IF EXISTS "Leitura codigo_rastreabilidade_contadores da obra" ON public.codigo_rastreabilidade_contadores;
CREATE POLICY "Leitura codigo_rastreabilidade_contadores da obra" ON public.codigo_rastreabilidade_contadores FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Escrita codigo_rastreabilidade_contadores da obra" ON public.codigo_rastreabilidade_contadores;
CREATE POLICY "Escrita codigo_rastreabilidade_contadores da obra" ON public.codigo_rastreabilidade_contadores FOR ALL TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_papel_modulo('qualidade') = 'edicao'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigo_rastreabilidade_contadores TO authenticated;

-- cargas_concreto (Leitura/Insercao/Edicao atualiza/Edicao exclui)
DROP POLICY IF EXISTS "Leitura cargas_concreto da propria empresa" ON public.cargas_concreto;
CREATE POLICY "Leitura cargas_concreto da obra" ON public.cargas_concreto FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Insercao cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Insercao cargas_concreto da obra" ON public.cargas_concreto FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') IN ('edicao','insercao_pontual')));
DROP POLICY IF EXISTS "Edicao atualiza cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao atualiza cargas_concreto da obra" ON public.cargas_concreto FOR UPDATE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));
DROP POLICY IF EXISTS "Edicao exclui cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao exclui cargas_concreto da obra" ON public.cargas_concreto FOR DELETE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));

-- destinos_carga (mesmo padrão de cargas_concreto)
DROP POLICY IF EXISTS "Leitura destinos_carga da propria empresa" ON public.destinos_carga;
CREATE POLICY "Leitura destinos_carga da obra" ON public.destinos_carga FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Insercao destinos_carga" ON public.destinos_carga;
CREATE POLICY "Insercao destinos_carga da obra" ON public.destinos_carga FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') IN ('edicao','insercao_pontual')));
DROP POLICY IF EXISTS "Edicao atualiza destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao atualiza destinos_carga da obra" ON public.destinos_carga FOR UPDATE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));
DROP POLICY IF EXISTS "Edicao exclui destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao exclui destinos_carga da obra" ON public.destinos_carga FOR DELETE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));

-- corpos_prova
DROP POLICY IF EXISTS "Leitura corpos_prova da propria empresa" ON public.corpos_prova;
CREATE POLICY "Leitura corpos_prova da obra" ON public.corpos_prova FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Insercao corpos_prova" ON public.corpos_prova;
CREATE POLICY "Insercao corpos_prova da obra" ON public.corpos_prova FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') IN ('edicao','insercao_pontual')));
DROP POLICY IF EXISTS "Edicao atualiza corpos_prova" ON public.corpos_prova;
CREATE POLICY "Edicao atualiza corpos_prova da obra" ON public.corpos_prova FOR UPDATE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));
DROP POLICY IF EXISTS "Edicao exclui corpos_prova" ON public.corpos_prova;
CREATE POLICY "Edicao exclui corpos_prova da obra" ON public.corpos_prova FOR DELETE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));

-- ensaios_corpos_prova (mesmo padrão)
DROP POLICY IF EXISTS "Leitura ensaios_corpos_prova da propria empresa" ON public.ensaios_corpos_prova;
CREATE POLICY "Leitura ensaios_corpos_prova da obra" ON public.ensaios_corpos_prova FOR SELECT TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade')));
DROP POLICY IF EXISTS "Insercao ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Insercao ensaios_corpos_prova da obra" ON public.ensaios_corpos_prova FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') IN ('edicao','insercao_pontual')));
DROP POLICY IF EXISTS "Edicao atualiza ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Edicao atualiza ensaios_corpos_prova da obra" ON public.ensaios_corpos_prova FOR UPDATE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));
DROP POLICY IF EXISTS "Edicao exclui ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Edicao exclui ensaios_corpos_prova da obra" ON public.ensaios_corpos_prova FOR DELETE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'edicao'));

-- Como ensaios_corpos_prova nasce sempre via upsert (LancarResultadoModal /
-- importer-ensaios-db) precisa também de uma política que cubra o caminho de
-- UPDATE do upsert com o mesmo IN('edicao','insercao_pontual') do INSERT —
-- sem isso, insercao_pontual conseguiria criar o ensaio mas não corrigi-lo.
DROP POLICY IF EXISTS "Insercao_pontual atualiza ensaios_corpos_prova" ON public.ensaios_corpos_prova;
CREATE POLICY "Insercao_pontual atualiza ensaios_corpos_prova da obra" ON public.ensaios_corpos_prova FOR UPDATE TO authenticated
  USING (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'insercao_pontual'))
  WITH CHECK (is_super_admin() OR (organizacao_id = user_organizacao() AND user_ve_projeto(projeto_id) AND user_ve_modulo('qualidade') AND user_papel_modulo('qualidade') = 'insercao_pontual'));

-- ============ 6. TRIGGER: código de rastreabilidade reinicia por obra e leva o código da obra ============
-- Formato novo: CC-{projetos.codigo}-{ano}-{numero}, ex. "CC-PRJ-002-2026-0001".
-- Contador agora é por (organizacao_id, projeto_id, ano) em vez de só
-- (organizacao_id, ano) — cada obra tem sua própria sequência, começando em
-- 0001. O prefixo de sigla da empresa (usado antes) sai de cena: o código da
-- obra já identifica de forma única.

CREATE OR REPLACE FUNCTION public.gerar_codigo_rastreabilidade_carga()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ano int := EXTRACT(YEAR FROM NEW.data)::int;
  v_numero int;
  v_projeto_codigo text;
  v_codigo text;
  v_partes text[];
BEGIN
  SELECT codigo INTO v_projeto_codigo FROM public.projetos WHERE id = NEW.projeto_id;
  IF v_projeto_codigo IS NULL THEN
    RAISE EXCEPTION 'Carga de concreto sem obra (projeto_id) válida — não é possível gerar código de rastreabilidade';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('carga-concreto:' || NEW.projeto_id::text || v_ano::text)::bigint);

  IF NEW.codigo_rastreabilidade IS NOT NULL THEN
    -- Código já veio pronto (import em massa gera no cliente) — só garante
    -- que o contador da obra não fique atrás dele, resolvendo colisão se
    -- alguém preencheu um código repetido.
    v_partes := regexp_match(NEW.codigo_rastreabilidade, '-([0-9]{4})-([0-9]+)$');
    IF v_partes IS NOT NULL THEN
      v_numero := v_partes[2]::int;
      IF EXISTS (SELECT 1 FROM public.cargas_concreto WHERE codigo_rastreabilidade = NEW.codigo_rastreabilidade) THEN
        LOOP
          v_numero := v_numero + 1;
          v_codigo := 'CC-' || v_projeto_codigo || '-' || v_ano || '-' || CASE WHEN v_numero < 10000 THEN lpad(v_numero::text,4,'0') ELSE v_numero::text END;
          EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cargas_concreto WHERE codigo_rastreabilidade = v_codigo);
        END LOOP;
        NEW.codigo_rastreabilidade := v_codigo;
      END IF;
      INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, projeto_id, ano, ultimo_numero)
      VALUES (NEW.organizacao_id, NEW.projeto_id, v_ano, v_numero)
      ON CONFLICT (organizacao_id, projeto_id, ano)
      DO UPDATE SET ultimo_numero = GREATEST(codigo_rastreabilidade_contadores.ultimo_numero, EXCLUDED.ultimo_numero);
    END IF;
    RETURN NEW;
  END IF;

  LOOP
    INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, projeto_id, ano, ultimo_numero)
    VALUES (NEW.organizacao_id, NEW.projeto_id, v_ano, 1)
    ON CONFLICT (organizacao_id, projeto_id, ano)
    DO UPDATE SET ultimo_numero = codigo_rastreabilidade_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;
    v_codigo := 'CC-' || v_projeto_codigo || '-' || v_ano || '-' || CASE WHEN v_numero < 10000 THEN lpad(v_numero::text,4,'0') ELSE v_numero::text END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cargas_concreto WHERE codigo_rastreabilidade = v_codigo);
  END LOOP;
  NEW.codigo_rastreabilidade := v_codigo;
  RETURN NEW;
END;
$$;

-- Backfill dos contadores existentes: garante que o "ultimo_numero" de cada
-- (organizacao_id, projeto_id, ano) reflita o maior número já usado nos
-- códigos antigos, agora que o contador passou a ser por obra — evita
-- colisão na primeira carga nova lançada após a migration.
DO $$
DECLARE
  r RECORD;
  v_max int;
BEGIN
  FOR r IN
    SELECT DISTINCT organizacao_id, projeto_id, EXTRACT(YEAR FROM data)::int AS ano
    FROM public.cargas_concreto WHERE projeto_id IS NOT NULL
  LOOP
    SELECT MAX((regexp_match(codigo_rastreabilidade, '-([0-9]+)$'))[1]::int) INTO v_max
    FROM public.cargas_concreto
    WHERE organizacao_id = r.organizacao_id AND projeto_id = r.projeto_id
      AND EXTRACT(YEAR FROM data)::int = r.ano AND codigo_rastreabilidade IS NOT NULL;
    IF v_max IS NOT NULL THEN
      INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, projeto_id, ano, ultimo_numero)
      VALUES (r.organizacao_id, r.projeto_id, r.ano, v_max)
      ON CONFLICT (organizacao_id, projeto_id, ano) DO UPDATE SET ultimo_numero = GREATEST(codigo_rastreabilidade_contadores.ultimo_numero, EXCLUDED.ultimo_numero);
    END IF;
  END LOOP;
END $$;

-- ============ 7. RPCs de seed: ganham p_projeto_id ============

DROP FUNCTION IF EXISTS public.seed_etapas_concreto_padrao(uuid);
CREATE OR REPLACE FUNCTION public.seed_etapas_concreto_padrao(p_organizacao_id uuid, p_projeto_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.etapas_concreto (organizacao_id, projeto_id, nome)
  SELECT p_organizacao_id, p_projeto_id, v.nome
  FROM (VALUES
    ('CONTRAPISO'), ('ESTACA FUNDAÇÃO'), ('BLOCO FUNDAÇÃO'), ('VIGA PRÉ MOLDADA'),
    ('PISO PLANO'), ('CALÇADA'), ('PISO INCLINADO'), ('PAREDE'), ('VIGA'), ('RADIER'),
    ('PILAR'), ('LAJE'), ('CANALETA'), ('ESTACA'), ('BLOCO'), ('DIVISÓRIA'), ('CORTINA'),
    ('CAIXA'), ('BASE'), ('MAGRO'), ('GRAUTE PLACA TÚNEL'), ('GRAUTE DOS PILARES'),
    ('DEGRAUS'), ('RADIER CANTEIRO'), ('ALOJAMENTO 01'), ('ALOJAMENTO HOTEL'),
    ('ESTACAS AZ 01 EIXO N'), ('RADIER USINA'), ('PRÉ MOLDADOS')
  ) AS v(nome)
  ON CONFLICT (organizacao_id, projeto_id, nome) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seed_etapas_concreto_padrao(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.seed_setores_areas_concreto_padrao(uuid);
CREATE OR REPLACE FUNCTION public.seed_setores_areas_concreto_padrao(p_organizacao_id uuid, p_projeto_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.setores_concreto (organizacao_id, projeto_id, nome)
  SELECT p_organizacao_id, p_projeto_id, s.nome FROM public.setores s
  ON CONFLICT (organizacao_id, projeto_id, nome) DO NOTHING;

  INSERT INTO public.areas_concreto (organizacao_id, projeto_id, setor_concreto_id, nome)
  SELECT p_organizacao_id, p_projeto_id, sc.id, a.nome
  FROM public.areas a
  JOIN public.setores s ON s.id = a.setor_id
  JOIN public.setores_concreto sc ON sc.organizacao_id = p_organizacao_id AND sc.projeto_id = p_projeto_id AND sc.nome = s.nome
  ON CONFLICT (organizacao_id, projeto_id, setor_concreto_id, nome) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seed_setores_areas_concreto_padrao(uuid, uuid) TO authenticated;

-- ============ 8. Views: expõem projeto_id pro frontend filtrar pela obra atual ============

-- DROP + CREATE (não "OR REPLACE"): o Postgres recusa CREATE OR REPLACE
-- quando a lista de colunas muda de posição no meio (só aceita coluna nova
-- no final, senão interpreta como "renomear" a coluna seguinte). Como
-- vw_rastreabilidade_concreto depende de vw_ensaios_concreto (subquery),
-- precisa derrubar na ordem certa (dependente primeiro) e recriar na ordem
-- inversa.
DROP VIEW IF EXISTS public.vw_rastreabilidade_concreto;
DROP VIEW IF EXISTS public.vw_ensaios_concreto;

CREATE VIEW public.vw_ensaios_concreto WITH (security_invoker = true) AS
SELECT
  cp.id AS corpo_prova_id, cp.organizacao_id, cp.projeto_id, cp.carga_id,
  cc.codigo_rastreabilidade, cc.data AS data_carga, cc.numero_carga, cc.nota_fiscal, cc.cod_laboratorio,
  cc.traco_id, tc.nome AS traco_nome, tc.fck_mpa,
  cp.laboratorio_id, lab.nome AS laboratorio_nome, cp.numero_lab, cp.peca_concretada,
  cp.idade_prevista_dias, cp.data_moldagem, cp.data_ruptura_prevista, cp.status,
  (cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS ensaio_atrasado,
  e.id AS ensaio_id, e.data_ruptura_real, e.resultado_mpa, e.tipo_ruptura, e.temperatura_concreto,
  e.slump_aplicacao, e.observacoes,
  CASE
    WHEN cp.idade_prevista_dias <> COALESCE(cfg.idade_referencia_dias, 28) THEN 'nao_aplica'
    WHEN e.resultado_mpa IS NULL THEN 'pendente'
    WHEN e.resultado_mpa >= tc.fck_mpa THEN 'conforme'
    ELSE 'nao_conforme'
  END AS status_conformidade
FROM public.corpos_prova cp
JOIN public.cargas_concreto cc ON cc.id = cp.carga_id
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
LEFT JOIN public.laboratorios lab ON lab.id = cp.laboratorio_id
LEFT JOIN public.ensaios_corpos_prova e ON e.corpo_prova_id = cp.id
LEFT JOIN public.organizacoes_config_ensaio cfg ON cfg.organizacao_id = cp.organizacao_id AND cfg.projeto_id = cp.projeto_id;

GRANT SELECT ON public.vw_ensaios_concreto TO authenticated;

CREATE VIEW public.vw_rastreabilidade_concreto WITH (security_invoker = true) AS
SELECT
  cc.id AS carga_id, cc.organizacao_id, cc.projeto_id, cc.codigo_rastreabilidade, cc.data, cc.numero_carga, cc.nota_fiscal,
  cc.cod_laboratorio, cc.dispensa_ensaio, cc.quantidade_m3,
  cc.traco_id, tc.nome AS traco_nome, tc.fck_mpa,
  cc.fornecedor_id, fc.nome AS fornecedor_nome,
  setor.nome AS setor_nome, area.nome AS area_nome, etapa.nome AS etapa_nome,
  COUNT(cp.id) AS total_cps,
  COUNT(cp.id) FILTER (WHERE cp.status = 'pendente') AS cps_pendentes,
  COUNT(cp.id) FILTER (WHERE cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS cps_atrasados,
  BOOL_OR(cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS tem_ensaio_atrasado,
  (SELECT ve.status_conformidade FROM public.vw_ensaios_concreto ve
   WHERE ve.carga_id = cc.id AND ve.status_conformidade IN ('conforme','nao_conforme')
   ORDER BY (ve.status_conformidade = 'nao_conforme') DESC LIMIT 1) AS status_conformidade_geral
FROM public.cargas_concreto cc
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
JOIN public.fornecedores_concreto fc ON fc.id = cc.fornecedor_id
LEFT JOIN public.corpos_prova cp ON cp.carga_id = cc.id
LEFT JOIN LATERAL (
  SELECT dc.setor_concreto_id, dc.area_concreto_id, dc.etapa_concreto_id
  FROM public.destinos_carga dc WHERE dc.carga_id = cc.id ORDER BY dc.id LIMIT 1
) dest ON true
LEFT JOIN public.setores_concreto setor ON setor.id = dest.setor_concreto_id
LEFT JOIN public.areas_concreto area ON area.id = dest.area_concreto_id
LEFT JOIN public.etapas_concreto etapa ON etapa.id = dest.etapa_concreto_id
GROUP BY cc.id, tc.nome, tc.fck_mpa, fc.nome, setor.nome, area.nome, etapa.nome;

GRANT SELECT ON public.vw_rastreabilidade_concreto TO authenticated;

NOTIFY pgrst, 'reload schema';
