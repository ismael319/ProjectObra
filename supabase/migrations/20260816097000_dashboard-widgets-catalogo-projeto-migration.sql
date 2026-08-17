-- ============================================================
-- MIGRAÇÃO: Dashboard customizável por projeto — catálogo de widgets,
-- layout e instâncias (Fase A)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Substitui o desenho anterior (public.dashboard_visao_geral_config, 1 linha
-- por ORGANIZAÇÃO com um blob jsonb) por um modelo normalizado, por PROJETO:
-- cada obra tem seu próprio layout, montado a partir de um catálogo real no
-- banco (não mais um enum fixo em TypeScript) — pensado pra crescer até um
-- "query builder" livre depois, sem quebrar quem já montou um dashboard.
--
-- dashboard_visao_geral_config fica pra trás sem DROP (só não é mais lida
-- pelo app) — a feature é nova, não há dado real de cliente nela ainda pra
-- valer a pena escrever um script de migração de dado.
-- ============================================================

-- ============ 1. CATÁLOGO DE TIPOS DE WIDGET ============
-- Catálogo GLOBAL da plataforma (não por organização) — mesma régua editorial
-- de public.modulos_comerciais: linha nova pode nascer 'planejado' (aparece
-- no catálogo como roadmap, mas não é instanciável) até a feature existir de
-- verdade.

CREATE TABLE IF NOT EXISTS public.widget_tipos (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  categoria text,
  -- Aponta pro módulo de RLS (public.modulos.key) cujo acesso já controla
  -- quem vê a tela de origem do dado — nullable pra widgets cross-módulo
  -- (ex.: um card de KPI geral) ou que não têm um módulo de RLS dedicado.
  modulo_origem text REFERENCES public.modulos(key),
  tipo_visualizacao text NOT NULL CHECK (tipo_visualizacao IN (
    'kpi_numerico', 'grafico_linha', 'grafico_barra', 'grafico_pizza', 'gauge', 'tabela', 'texto', 'imagem'
  )),
  -- Nome de uma view/RPC já agregada no banco, quando existir (ex.:
  -- 'vw_rastreabilidade_concreto', 'vw_projeto_kpis'). NULL = o cálculo hoje
  -- é feito no cliente (Curva S, Histograma, Mapa de Setores, EAP) — o
  -- componente do widget sabe buscar do jeito que já busca, sem passar por
  -- uma view genérica. É o "gancho" pra um query builder livre no futuro:
  -- dá pra trocar fonte_view por uma referência a uma query salva pelo
  -- usuário sem mudar a forma da tabela.
  fonte_view text,
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('ativo', 'beta', 'planejado')),
  ordem_exibicao integer NOT NULL DEFAULT 0
);

ALTER TABLE public.widget_tipos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.widget_tipos TO authenticated;

DROP POLICY IF EXISTS "Leitura catalogo widget_tipos" ON public.widget_tipos;
CREATE POLICY "Leitura catalogo widget_tipos" ON public.widget_tipos
  FOR SELECT TO authenticated USING (true);

GRANT INSERT, UPDATE, DELETE ON public.widget_tipos TO authenticated;
DROP POLICY IF EXISTS "Dono gerencia widget_tipos" ON public.widget_tipos;
CREATE POLICY "Dono gerencia widget_tipos" ON public.widget_tipos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 2. LAYOUT (1 ou mais por projeto) ============
-- "nome" com UNIQUE(projeto_id, nome) já deixa o schema pronto pra múltiplos
-- dashboards nomeados por obra (ex.: "Visão Executiva", "Visão Operacional")
-- mesmo a fase atual só criando/usando um ("Visão Geral") por projeto — não
-- precisa de outra migration só pra isso quando a decisão de produto vier.

CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Visão Geral',
  aspecto text NOT NULL DEFAULT '16:9' CHECK (aspecto IN ('16:9', '4:3', '1:1')),
  fonte integer NOT NULL DEFAULT 14,
  tema text NOT NULL DEFAULT 'claro' CHECK (tema IN ('claro', 'escuro')),
  grade integer NOT NULL DEFAULT 32,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, nome)
);

CREATE INDEX IF NOT EXISTS dashboard_layouts_projeto_idx ON public.dashboard_layouts (projeto_id);

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_layouts TO authenticated;

DROP POLICY IF EXISTS "Leitura dashboard_layouts do projeto" ON public.dashboard_layouts;
CREATE POLICY "Leitura dashboard_layouts do projeto" ON public.dashboard_layouts
  FOR SELECT TO authenticated
  USING (public.user_ve_projeto(projeto_id));

-- Mesma regra de podeEditarDashboard já usada no app hoje: papel Edição
-- (global, não por módulo — o dashboard cruza dado de vários módulos) ou
-- Dono da Plataforma.
DROP POLICY IF EXISTS "Edicao gerencia dashboard_layouts" ON public.dashboard_layouts;
CREATE POLICY "Edicao gerencia dashboard_layouts" ON public.dashboard_layouts
  FOR ALL TO authenticated
  USING (public.user_ve_projeto(projeto_id) AND (public.is_super_admin() OR public.user_papel() = 'edicao'))
  WITH CHECK (public.user_ve_projeto(projeto_id) AND (public.is_super_admin() OR public.user_papel() = 'edicao'));

-- ============ 3. INSTÂNCIAS DE WIDGET NO GRID ============
-- "imagem" (foto solta) usa este mesmo desenho — um widget_tipos codigo
-- 'FOTO' (seed abaixo) com fonte_view NULL, e o path/legenda guardados em
-- configuracao. Não existe uma tabela de foto separada: é só mais uma
-- instância, com posição/tamanho como qualquer outra.

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_layout_id uuid NOT NULL REFERENCES public.dashboard_layouts(id) ON DELETE CASCADE,
  -- Denormalizado de dashboard_layouts.projeto_id de propósito — a mesma
  -- checagem de RLS (user_ve_projeto) sem precisar de subquery/join em toda
  -- policy desta tabela, mesmo padrão já usado em mapa_setores_marcadores
  -- (que também denormaliza organizacao_id do pai).
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  widget_tipo_codigo text NOT NULL REFERENCES public.widget_tipos(codigo),
  titulo_customizado text,
  -- Overrides livres (filtro de período, cor, path/legenda de foto...) — de
  -- propósito solto (não uma coluna por override possível), mesma lógica de
  -- "não travar o schema" do fonte_view acima.
  configuracao jsonb NOT NULL DEFAULT '{}',
  visivel boolean NOT NULL DEFAULT true,
  pos_x integer NOT NULL DEFAULT 0,
  pos_y integer NOT NULL DEFAULT 0,
  largura integer NOT NULL DEFAULT 4,
  altura integer NOT NULL DEFAULT 4,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_widgets_layout_idx ON public.dashboard_widgets (dashboard_layout_id);
CREATE INDEX IF NOT EXISTS dashboard_widgets_projeto_idx ON public.dashboard_widgets (projeto_id);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_widgets TO authenticated;

DROP POLICY IF EXISTS "Leitura dashboard_widgets do projeto" ON public.dashboard_widgets;
CREATE POLICY "Leitura dashboard_widgets do projeto" ON public.dashboard_widgets
  FOR SELECT TO authenticated
  USING (public.user_ve_projeto(projeto_id));

DROP POLICY IF EXISTS "Edicao gerencia dashboard_widgets" ON public.dashboard_widgets;
CREATE POLICY "Edicao gerencia dashboard_widgets" ON public.dashboard_widgets
  FOR ALL TO authenticated
  USING (public.user_ve_projeto(projeto_id) AND (public.is_super_admin() OR public.user_papel() = 'edicao'))
  WITH CHECK (public.user_ve_projeto(projeto_id) AND (public.is_super_admin() OR public.user_papel() = 'edicao'));

-- ============ 4. TRAVA: só widget_tipos 'ativo' pode ser instanciado ============

CREATE OR REPLACE FUNCTION public.valida_widget_tipo_ativo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.widget_tipos WHERE codigo = NEW.widget_tipo_codigo;
  IF v_status IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'Tipo de widget "%" não está ativo (status atual: %) e não pode ser adicionado ao dashboard', NEW.widget_tipo_codigo, v_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_widget_tipo_ativo ON public.dashboard_widgets;
CREATE TRIGGER trg_valida_widget_tipo_ativo
  BEFORE INSERT OR UPDATE OF widget_tipo_codigo ON public.dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION public.valida_widget_tipo_ativo();

-- ============ 5. SEED DO CATÁLOGO ============
-- "ativo": os 8 widgets que já existem hoje na Visão Geral (client-side,
-- fonte_view NULL) + os 2 que já têm view agregada pronta (Qualidade e o
-- snapshot de KPIs do Portfólio) + FOTO. "planejado": RDO — não existe como
-- feature ainda (só RDR, Segurança, que é outra coisa) — aparece no
-- catálogo como roadmap, mas o trigger acima impede de instanciar.

INSERT INTO public.widget_tipos (codigo, nome, descricao, categoria, modulo_origem, tipo_visualizacao, fonte_view, status, ordem_exibicao) VALUES
  ('KPIS', 'Cards de KPI', 'Indicadores gerais do cronograma: total de atividades, % concluído, no prazo e atrasadas.', 'engenharia', 'engenharia', 'kpi_numerico', NULL, 'ativo', 10),
  ('EVM', 'Indicadores de Performance (EVM)', 'SPI, CPI, PPC, variações SV/CV, EAC e VAC — calculados das atividades em tempo real.', 'engenharia', 'engenharia', 'kpi_numerico', NULL, 'ativo', 20),
  ('CHARTS', 'Gráficos (status e mensal)', 'Distribuição de atividades por status e ritmo de início por mês.', 'engenharia', 'engenharia', 'grafico_pizza', NULL, 'ativo', 30),
  ('CURVA_S', 'Curva de progresso', 'Curva S simplificada: avanço físico previsto x realizado, em % acumulado.', 'engenharia', 'engenharia', 'grafico_linha', NULL, 'ativo', 40),
  ('ENGINEERING', 'Pontos de Engenharia', 'Avanço por disciplina, próximos marcos e atividades mais atrasadas.', 'engenharia', 'engenharia', 'tabela', NULL, 'ativo', 50),
  ('OCCURRENCES', 'Ocorrências', 'Resumo das ocorrências abertas por severidade e impacto em dias.', 'engenharia', 'engenharia', 'tabela', NULL, 'ativo', 60),
  ('WORKFORCE', 'Mão de Obra', 'Resumo do efetivo — HH apontadas e recursos ativos por grupo.', 'engenharia', 'engenharia', 'grafico_barra', NULL, 'ativo', 70),
  ('WBS_TABLE', 'Estrutura WBS', 'Lista completa das atividades pela Estrutura Analítica do Projeto (EAP).', 'engenharia', 'engenharia', 'tabela', NULL, 'ativo', 80),
  -- 'planejado' (não 'ativo'): cargas_concreto/vw_rastreabilidade_concreto
  -- não têm projeto_id — são só por organização. Num dashboard por OBRA,
  -- mostrar esse card hoje vazaria dado de todas as obras juntas. Fica no
  -- catálogo como roadmap até o módulo Qualidade ganhar projeto_id de
  -- verdade (fora do escopo desta migration).
  ('RASTREABILIDADE_CONCRETO', 'Rastreabilidade de Concreto', 'Cargas de concreto, ensaios pendentes/atrasados e conformidade de FCK por carga. Aguardando o módulo Qualidade ganhar vínculo por obra.', 'qualidade', 'qualidade', 'tabela', 'vw_rastreabilidade_concreto', 'planejado', 90),
  ('KPI_PROJETO_SNAPSHOT', 'KPIs do Projeto (snapshot)', 'Avanço físico x planejado, PPC da última semana, restrições e ocorrências abertas — semáforo verde/amarelo/vermelho.', 'engenharia', NULL, 'kpi_numerico', 'vw_projeto_kpis', 'ativo', 100),
  ('FOTO', 'Foto', 'Imagem enviada pelo usuário — aviso, logo da obra ou o que fizer sentido no dashboard.', 'geral', NULL, 'imagem', NULL, 'ativo', 110),
  ('RDO_DIARIO', 'Diário de Obra (RDO)', 'Resumo do Diário de Obra — depende da feature de RDO, que ainda não existe na plataforma.', 'engenharia', NULL, 'tabela', NULL, 'planejado', 120)
ON CONFLICT (codigo) DO NOTHING;

NOTIFY pgrst, 'reload schema';
