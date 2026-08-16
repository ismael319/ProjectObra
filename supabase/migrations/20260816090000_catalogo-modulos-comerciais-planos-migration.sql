-- ============================================================
-- MIGRAÇÃO: Catálogo comercial de módulos e planos (Fase A)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Já existe um catálogo de módulos (public.modulos) usado só para
-- visibilidade/permissão de tela via RLS — granularidade grossa (engenharia,
-- seguranca, qualidade, administracao, suprimentos, sistema), contratado
-- manualmente pelo Dono da Plataforma, sem qualquer noção de preço.
--
-- Esta migração cria um catálogo NOVO e PARALELO — public.modulos_comerciais
-- — para modelar precificação em granularidade de venda (que pode ser mais
-- fina que um módulo de RLS inteiro, ex.: "Gestão à Vista" e "Mapa de
-- Setores" são telas dentro do módulo de RLS "engenharia", mas são vendidas
-- separadamente). Cada linha aqui pode apontar pra QUAL módulo de RLS
-- existente ela desbloqueia (modulo_rls_key), quando fizer sentido.
--
-- Fase desta migração: só estrutura de dados + catálogo. Sem checkout, sem
-- cobrança automática, sem gateway de pagamento — isso fica pra uma fase
-- futura. Os valores do seed abaixo são de desenvolvimento/homologação, não
-- de produção; ainda serão validados comercialmente.
-- ============================================================

-- ============ 1. CATÁLOGO COMERCIAL DE MÓDULOS ============

CREATE TABLE IF NOT EXISTS public.modulos_comerciais (
  codigo text PRIMARY KEY,
  nome text NOT NULL,
  categoria text,
  descricao text,
  -- Nullable de propósito: para módulos novos (ex. Gestão à Vista, Mapa de
  -- Setores) o modelo de cobrança ainda não foi decidido comercialmente.
  tipo_cobranca text CHECK (tipo_cobranca IN ('incluso_no_plano', 'fixo', 'por_usuario', 'por_obra', 'por_usuario_e_obra')),
  -- Aponta pro módulo de RLS (public.modulos.key) que esse item comercial
  -- desbloqueia, quando existir um. NULL para módulos cross-cutting que não
  -- têm (ainda) um gate de RLS dedicado, ex. CHATBOT_IA.
  modulo_rls_key text REFERENCES public.modulos(key),
  -- FK simples (não tabela associativa): as dependências mapeadas até agora
  -- são hierárquicas — uma tela satélite (Mapa de Setores) precisa do núcleo
  -- (Cronograma) pra ter dado pra mostrar — não há caso de múltipla
  -- dependência ainda. Se aparecer, evolui pra tabela associativa depois.
  modulo_dependencia_id text REFERENCES public.modulos_comerciais(codigo),
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('ativo', 'beta', 'planejado', 'deprecated')),
  ordem_exibicao integer NOT NULL DEFAULT 0
);

ALTER TABLE public.modulos_comerciais ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.modulos_comerciais TO authenticated;

DROP POLICY IF EXISTS "Leitura catalogo comercial" ON public.modulos_comerciais;
CREATE POLICY "Leitura catalogo comercial" ON public.modulos_comerciais
  FOR SELECT TO authenticated USING (true);

GRANT INSERT, UPDATE, DELETE ON public.modulos_comerciais TO authenticated;
DROP POLICY IF EXISTS "Dono gerencia catalogo comercial" ON public.modulos_comerciais;
CREATE POLICY "Dono gerencia catalogo comercial" ON public.modulos_comerciais
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 2. PREÇOS VERSIONADOS POR VIGÊNCIA ============
-- Preço nunca é hardcoded no código — vive aqui, com vigência, porque os
-- valores iniciais são de teste e serão ajustados com prospects reais.

CREATE TABLE IF NOT EXISTS public.modulo_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_codigo text NOT NULL REFERENCES public.modulos_comerciais(codigo) ON DELETE CASCADE,
  valor_fixo numeric(10, 2),
  valor_por_usuario numeric(10, 2),
  valor_por_obra numeric(10, 2),
  valor_minimo numeric(10, 2),
  vigencia_inicio date NOT NULL DEFAULT current_date,
  vigencia_fim date,
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE INDEX IF NOT EXISTS modulo_precos_modulo_idx ON public.modulo_precos (modulo_codigo, vigencia_inicio);

ALTER TABLE public.modulo_precos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modulo_precos TO authenticated;

DROP POLICY IF EXISTS "Leitura precos" ON public.modulo_precos;
CREATE POLICY "Leitura precos" ON public.modulo_precos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Dono gerencia precos" ON public.modulo_precos;
CREATE POLICY "Dono gerencia precos" ON public.modulo_precos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 3. PLANOS (bundle de módulos) ============

CREATE TABLE IF NOT EXISTS public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nome text NOT NULL,
  descricao text,
  -- NULL = "sob consulta" (caso do Enterprise) — não confundir com zero.
  preco_base_mensal numeric(10, 2),
  limite_usuarios_incluidos integer,
  limite_obras_incluidas integer,
  preco_usuario_excedente numeric(10, 2),
  preco_obra_excedente numeric(10, 2),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'descontinuado')),
  ordem_exibicao integer NOT NULL DEFAULT 0
);

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.planos TO authenticated;

DROP POLICY IF EXISTS "Leitura planos" ON public.planos;
CREATE POLICY "Leitura planos" ON public.planos FOR SELECT TO authenticated USING (true);

GRANT INSERT, UPDATE, DELETE ON public.planos TO authenticated;
DROP POLICY IF EXISTS "Dono gerencia planos" ON public.planos;
CREATE POLICY "Dono gerencia planos" ON public.planos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 4. QUAIS MÓDULOS CADA PLANO INCLUI ============

CREATE TABLE IF NOT EXISTS public.plano_modulos (
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  modulo_codigo text NOT NULL REFERENCES public.modulos_comerciais(codigo) ON DELETE CASCADE,
  PRIMARY KEY (plano_id, modulo_codigo)
);

ALTER TABLE public.plano_modulos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.plano_modulos TO authenticated;

DROP POLICY IF EXISTS "Leitura plano_modulos" ON public.plano_modulos;
CREATE POLICY "Leitura plano_modulos" ON public.plano_modulos FOR SELECT TO authenticated USING (true);

GRANT INSERT, UPDATE, DELETE ON public.plano_modulos TO authenticated;
DROP POLICY IF EXISTS "Dono gerencia plano_modulos" ON public.plano_modulos;
CREATE POLICY "Dono gerencia plano_modulos" ON public.plano_modulos
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============ 5. SEED DE DESENVOLVIMENTO/HOMOLOGAÇÃO ============
-- Ajustes feitos em cima do rascunho original, validados em conversa:
--  - "RDO (Diário de Obra)" foi removido: não existe essa tela no código
--    hoje (só existe RDR, registro de risco/desvio de Segurança — outra
--    coisa). Fica de fora até a feature existir de verdade.
--  - Gestão à Vista e Mapa de Setores viraram avulsos (não inclusos no
--    Essencial) — hoje são só itens de menu dentro do módulo de RLS
--    "engenharia", sem preço comercial definido ainda (tipo_cobranca NULL).
--  - "Histogramas" e "Dashboard Macro/Portfólio" do rascunho original NÃO
--    viraram item comercial separado: Histograma já está sob o mesmo gate de
--    RLS que o resto do Cronograma (não dá pra vender separado sem outra
--    migração desmembrando o RLS), e o Dashboard de Portfólio ainda não tem
--    nenhum gate de módulo no código (é liberado por escopo de usuário, não
--    por contrato) — não fabricamos um SKU pra uma trava que não existe.
--  - SSO e acesso à API (mencionados como diferenciais Enterprise) não têm
--    nenhum código ainda, nem planejamento técnico — não entraram no
--    catálogo pra não sugerir uma promessa que não foi de fato roadmapeada.

INSERT INTO public.modulos_comerciais (codigo, nome, categoria, descricao, tipo_cobranca, modulo_rls_key, modulo_dependencia_id, status, ordem_exibicao) VALUES
  ('CRONOGRAMA', 'Cronograma / Planejamento', 'engenharia', 'Curva S, Programação, Gantt Livre, Histograma, Distribuição de Efetivo, Ocorrências e Mapa de Chuvas — tudo que hoje está sob o módulo de RLS "engenharia".', 'incluso_no_plano', 'engenharia', NULL, 'ativo', 10),
  ('QUALIDADE', 'Qualidade (Concreto)', 'qualidade', 'Rastreabilidade e controle de concreto.', 'por_obra', 'qualidade', NULL, 'ativo', 20),
  ('RH', 'Administração / RH', 'administracao', 'Controle de funcionários, cargos, ponto e efetivo.', 'por_usuario', 'administracao', NULL, 'ativo', 30),
  ('SUPRIMENTOS', 'Suprimentos (Alertas Sienge)', 'suprimentos', 'Alertas de suprimentos integrados ao Sienge.', NULL, 'suprimentos', NULL, 'ativo', 40),
  ('GESTAO_VISTA', 'Gestão à Vista', 'engenharia', 'Painel de avanço em malha de células sobre planta baixa. Precisa do Cronograma para ter dado a mostrar.', NULL, 'engenharia', 'CRONOGRAMA', 'ativo', 50),
  ('MAPA_SETORES', 'Mapa de Setores', 'engenharia', 'Marcadores de avanço em geometria livre sobre planta baixa, já inclui exportação de imagem. Precisa do Cronograma para ter dado a mostrar.', NULL, 'engenharia', 'CRONOGRAMA', 'ativo', 60),
  ('CHATBOT_IA', 'Assistente Virtual (IA)', 'produtividade', 'Assistente que consulta dados do cronograma via chat. Hoje ligado/desligado por preferência local do usuário, ainda sem enforcement de contrato.', 'por_usuario', NULL, NULL, 'ativo', 70),
  ('WHATSAPP_RDO', 'WhatsApp para RDO', 'integracoes', 'Envio de Diário de Obra via WhatsApp. Depende de credenciais de API do Diário de Obras ainda pendentes — aparece no catálogo para fins comerciais/roadmap, mas não pode ser ativado por nenhuma organização enquanto o status for "planejado".', 'fixo', NULL, NULL, 'planejado', 80)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.modulo_precos (modulo_codigo, valor_fixo, valor_por_usuario, valor_por_obra, valor_minimo) VALUES
  ('QUALIDADE', NULL, NULL, 80.00, NULL),
  ('RH', 150.00, 5.00, NULL, NULL),
  ('CHATBOT_IA', NULL, 15.00, NULL, NULL),
  ('WHATSAPP_RDO', 200.00, NULL, NULL, NULL);

INSERT INTO public.planos (codigo, nome, descricao, preco_base_mensal, limite_usuarios_incluidos, limite_obras_incluidas, preco_usuario_excedente, preco_obra_excedente, status, ordem_exibicao) VALUES
  ('ESSENCIAL', 'Essencial', 'Cronograma/Gantt para times pequenos.', 297.00, 5, 2, 25.00, 80.00, 'ativo', 10),
  ('PROFISSIONAL', 'Profissional', 'Essencial + Qualidade.', 897.00, 15, 6, 35.00, 120.00, 'ativo', 20),
  ('ENTERPRISE', 'Enterprise', 'Todos os módulos ativos do catálogo, negociado sob consulta.', NULL, NULL, NULL, NULL, NULL, 'ativo', 30)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.plano_modulos (plano_id, modulo_codigo)
SELECT p.id, m.codigo FROM public.planos p, public.modulos_comerciais m
WHERE p.codigo = 'ESSENCIAL' AND m.codigo IN ('CRONOGRAMA')
ON CONFLICT DO NOTHING;

INSERT INTO public.plano_modulos (plano_id, modulo_codigo)
SELECT p.id, m.codigo FROM public.planos p, public.modulos_comerciais m
WHERE p.codigo = 'PROFISSIONAL' AND m.codigo IN ('CRONOGRAMA', 'QUALIDADE')
ON CONFLICT DO NOTHING;

INSERT INTO public.plano_modulos (plano_id, modulo_codigo)
SELECT p.id, m.codigo FROM public.planos p, public.modulos_comerciais m
WHERE p.codigo = 'ENTERPRISE' AND m.status = 'ativo'
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- COMO ADICIONAR UM MÓDULO NOVO AO CATÁLOGO (referência rápida)
-- ============================================================
-- 1. INSERT em modulos_comerciais com um `codigo` novo (maiúsculo,
--    snake_case, ex. 'RELATORIOS_BI'). Comece com status = 'planejado' se o
--    código ainda não existir de verdade — só promova pra 'ativo' quando a
--    feature estiver funcionando, porque o trigger valida_modulo_comercial_
--    ativo() (migration seguinte) bloqueia contratar/incluir em plano
--    qualquer módulo que não esteja 'ativo'.
-- 2. Se o módulo desbloquear uma tela protegida por um dos módulos de RLS
--    existentes (public.modulos: engenharia/seguranca/qualidade/
--    administracao/suprimentos/sistema), preencha modulo_rls_key. Se for
--    cross-cutting sem gate de RLS dedicado (como CHATBOT_IA), deixe NULL.
-- 3. Se depender de outro módulo comercial pra ter dado/sentido (como
--    Gestão à Vista/Mapa de Setores dependem de CRONOGRAMA), preencha
--    modulo_dependencia_id com o `codigo` do módulo do qual depende.
-- 4. Cadastre o preço em modulo_precos (pode ficar sem linha — e portanto
--    sem preço definido — enquanto o modelo comercial não for decidido).
-- 5. Se o módulo entrar em algum plano por padrão, adicione a linha em
--    plano_modulos. Senão, ele só fica disponível como avulso, contratado
--    por organização via INSERT em organizacao_modulos_avulsos.
-- 6. Se o módulo precisar mesmo de enforcement no banco (não só esconder
--    botão no front), replique o padrão RESTRICTIVE da migration de Fase D
--    (rls-feature-gating-comercial-migration.sql) nas tabelas desse módulo,
--    chamando organizacao_pode_ler_modulo_comercial('SEU_CODIGO') /
--    organizacao_pode_escrever_modulo_comercial('SEU_CODIGO').
-- ============================================================
