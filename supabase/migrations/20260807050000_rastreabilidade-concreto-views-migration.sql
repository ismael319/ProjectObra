-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Views de leitura da Rastreabilidade de Concreto (ver 20260807040000_
-- rastreabilidade-concreto-fundacao-migration.sql). Ambas com
-- security_invoker = true: sem isso, uma view criada via migration roda com
-- os privilégios do DONO da view (o papel usado pela migration, que faz
-- bypass de RLS), o que vazaria dados de TODAS as organizações pra
-- qualquer usuário autenticado que consultasse a view — com
-- security_invoker, a view respeita a RLS das tabelas base como se o
-- próprio usuário logado tivesse feito a query direto nelas.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. vw_ensaios_concreto ============
-- Uma linha por corpo de prova (LEFT JOIN com o resultado — CP pendente
-- aparece com as colunas de ensaio em branco). status_conformidade só é
-- 'conforme'/'nao_conforme' pro CP moldado na idade de referência
-- configurada (organizacoes_config_ensaio.idade_referencia_dias, padrão 28
-- dias) — critério simples (Fcj >= Fck), sem estatística por lote (NBR
-- 12655 fica pra uma fase futura, combinado com o Gustavo). CPs de outras
-- idades (ex.: 7 dias) são só acompanhamento, não decidem conformidade.

CREATE OR REPLACE VIEW public.vw_ensaios_concreto WITH (security_invoker = true) AS
SELECT
  cp.id AS corpo_prova_id,
  cp.organizacao_id,
  cp.carga_id,
  cc.codigo_rastreabilidade,
  cc.data AS data_carga,
  cc.numero_carga,
  cc.nota_fiscal,
  cc.traco_id,
  tc.nome AS traco_nome,
  tc.fck_mpa,
  cp.laboratorio_id,
  lab.nome AS laboratorio_nome,
  cp.numero_lab,
  cp.peca_concretada,
  cp.idade_prevista_dias,
  cp.data_moldagem,
  cp.data_ruptura_prevista,
  cp.status,
  (cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS ensaio_atrasado,
  e.id AS ensaio_id,
  e.data_ruptura_real,
  e.resultado_mpa,
  e.tipo_ruptura,
  e.temperatura_concreto,
  e.slump_aplicacao,
  e.observacoes,
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
LEFT JOIN public.organizacoes_config_ensaio cfg ON cfg.organizacao_id = cp.organizacao_id;

GRANT SELECT ON public.vw_ensaios_concreto TO authenticated;

-- ============ 2. vw_rastreabilidade_concreto ============
-- Uma linha por carga, agregando os CPs — pra tela de lista (busca por
-- código/nota fiscal/peça, status geral, alerta de atraso).
-- status_conformidade_geral: 'nao_conforme' se QUALQUER CP na idade de
-- referência reprovou (prevalece sobre os demais), senão 'conforme' se
-- pelo menos um passou, senão NULL (nenhum resultado na idade de
-- referência lançado ainda — trata como pendente no front).

CREATE OR REPLACE VIEW public.vw_rastreabilidade_concreto WITH (security_invoker = true) AS
SELECT
  cc.id AS carga_id,
  cc.organizacao_id,
  cc.codigo_rastreabilidade,
  cc.data,
  cc.numero_carga,
  cc.nota_fiscal,
  cc.quantidade_m3,
  cc.traco_id,
  tc.nome AS traco_nome,
  tc.fck_mpa,
  cc.fornecedor_id,
  fc.nome AS fornecedor_nome,
  COUNT(cp.id) AS total_cps,
  COUNT(cp.id) FILTER (WHERE cp.status = 'pendente') AS cps_pendentes,
  COUNT(cp.id) FILTER (WHERE cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS cps_atrasados,
  BOOL_OR(cp.status = 'pendente' AND cp.data_ruptura_prevista < CURRENT_DATE) AS tem_ensaio_atrasado,
  (
    SELECT ve.status_conformidade FROM public.vw_ensaios_concreto ve
    WHERE ve.carga_id = cc.id AND ve.status_conformidade IN ('conforme', 'nao_conforme')
    ORDER BY (ve.status_conformidade = 'nao_conforme') DESC
    LIMIT 1
  ) AS status_conformidade_geral
FROM public.cargas_concreto cc
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
JOIN public.fornecedores_concreto fc ON fc.id = cc.fornecedor_id
LEFT JOIN public.corpos_prova cp ON cp.carga_id = cc.id
GROUP BY cc.id, tc.nome, tc.fck_mpa, fc.nome;

GRANT SELECT ON public.vw_rastreabilidade_concreto TO authenticated;

NOTIFY pgrst, 'reload schema';
