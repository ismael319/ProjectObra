-- ============================================================
-- MIGRAÇÃO: Curva S por peso atribuído (2ª forma de visualização)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Segunda forma de visualizar a Curva S (a curva por trabalho/HH já existe e
-- continua 100% client-side, sem nenhuma tabela). Esta é a curva por peso
-- atribuído/valor financeiro (R$), reproduzindo a lógica da planilha
-- "Curva S - 735 001 - FS Armazém IV PVA.xlsb" (piloto TEIÚ / BDR).
--
-- Segue o mesmo padrão do Mapa de Setores: NÃO normaliza atividades em tabela
-- própria. Peso atribuído (Número1), disciplina (Texto7), datas de baseline e
-- datas reais continuam vivendo só no jsonb `projeto_cronogramas.dados` — o
-- que falta persistir é só o que não existe hoje em lugar nenhum: config do
-- corte semanal, feriados, e o resultado semanal já calculado (materializado
-- pelo cliente, que é quem consegue ler o blob comprimido).
--
-- Checkpoint de design fechado em 2026-08-19 (ver memória de sessão):
--   - Corte semanal configurável por projeto (padrão quinta/domingo de folga).
--   - Forecast = reprojeção proporcional do saldo do Planejado, ancorada no
--     Executado real, fechando em 100% na mesma semana final do Planejado
--     (fórmula validada contra a planilha original).
--   - Peso atribuído = Número1 do cronograma (dedicado só a este módulo).
--   - Sem linha de base "com interferência"/replanejamento nesta fase.
--   - Disciplina = Texto7 do cronograma; "Externa" sempre excluída do cálculo.
--   - Sem versionamento de baseline (baseline já vem do próprio cronograma).
--   - Resultado semanal em tabela materializada (fase de validação/piloto).
-- ============================================================

-- ─── Data de status por cronograma: usar a do XML ou sobrescrever manualmente ───
ALTER TABLE public.projeto_cronogramas
  ADD COLUMN IF NOT EXISTS data_status_modo text NOT NULL DEFAULT 'cronograma',
  ADD COLUMN IF NOT EXISTS data_status_manual date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projeto_cronogramas_data_status_modo_check') THEN
    ALTER TABLE public.projeto_cronogramas
      ADD CONSTRAINT projeto_cronogramas_data_status_modo_check
      CHECK (data_status_modo IN ('cronograma', 'manual'));
  END IF;
END $$;

-- ─── Config do corte semanal, por projeto ───
CREATE TABLE IF NOT EXISTS public.curva_s_config (
  projeto_id uuid PRIMARY KEY,
  organizacao_id uuid NOT NULL,
  -- 0=domingo .. 6=sábado (convenção Date.getDay()). Padrão do piloto: quinta (4).
  dia_corte_semana smallint NOT NULL DEFAULT 4,
  -- Dia sem expediente, excluído da contagem de dias úteis. Padrão do piloto: domingo (0).
  dia_folga_semanal smallint NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curva_s_config_dia_corte_check CHECK (dia_corte_semana BETWEEN 0 AND 6),
  CONSTRAINT curva_s_config_dia_folga_check CHECK (dia_folga_semanal BETWEEN 0 AND 6),
  CONSTRAINT curva_s_config_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE
);

-- ─── Feriados considerados no cálculo de dias úteis, por projeto ───
CREATE TABLE IF NOT EXISTS public.curva_s_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL,
  organizacao_id uuid NOT NULL,
  data date NOT NULL,
  descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curva_s_feriados_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE,
  CONSTRAINT curva_s_feriados_projeto_data_key UNIQUE (projeto_id, data)
);

-- ─── Resultado semanal calculado (materializado pelo cliente) ───
-- disciplina = 'GERAL' pra curva consolidada, ou o valor de Texto7 pra curva
-- de uma disciplina específica (uma linha por semana por curva).
CREATE TABLE IF NOT EXISTS public.curva_s_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL,
  organizacao_id uuid NOT NULL,
  disciplina text NOT NULL DEFAULT 'GERAL',
  semana_indice integer NOT NULL,
  data_corte date NOT NULL,
  avanco_planejado_semana numeric NOT NULL DEFAULT 0,
  avanco_planejado_acum numeric NOT NULL DEFAULT 0,
  -- Nulos em semanas futuras à data de status (equivalente ao #N/D da planilha).
  avanco_executado_semana numeric,
  avanco_executado_acum numeric,
  forecast_acum numeric,
  desvio_semana numeric,
  desvio_acum numeric,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curva_s_semanas_projeto_organizacao_fkey FOREIGN KEY (projeto_id, organizacao_id) REFERENCES public.projetos(id, organizacao_id) ON DELETE CASCADE,
  CONSTRAINT curva_s_semanas_projeto_disciplina_semana_key UNIQUE (projeto_id, disciplina, semana_indice)
);

CREATE INDEX IF NOT EXISTS idx_curva_s_semanas_projeto_disciplina ON public.curva_s_semanas (projeto_id, disciplina);

ALTER TABLE public.curva_s_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curva_s_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curva_s_semanas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curva_s_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curva_s_feriados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curva_s_semanas TO authenticated;

-- Mesmo padrão de RLS do módulo "engenharia" (ver
-- 20260813040000_ativa-rls-legado-por-obra.sql): leitura pra quem enxerga o
-- módulo e a obra; escrita só pra papel de edição. curva_s_semanas é cache
-- derivado (recalculado e regravado pelo cliente a cada mudança relevante),
-- por isso segue a mesma regra de escrita das demais — sem papel específico
-- de "só leitura pode atualizar cache".
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['curva_s_config', 'curva_s_feriados', 'curva_s_semanas']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Leitura %I da obra" ON public.%I', tabela, tabela);
    EXECUTE format('DROP POLICY IF EXISTS "Escrita %I da obra" ON public.%I', tabela, tabela);

    EXECUTE format($sql$
      CREATE POLICY "Leitura %1$I da obra" ON public.%1$I FOR SELECT TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_ve_modulo('engenharia')))
    $sql$, tabela);

    EXECUTE format($sql$
      CREATE POLICY "Escrita %1$I da obra" ON public.%1$I FOR ALL TO authenticated
      USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'))
      WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_projeto(projeto_id) AND public.user_papel_modulo('engenharia') = 'edicao'))
    $sql$, tabela);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
