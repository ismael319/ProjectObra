-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Migration: Lógica de atingimento FCK por idade do corpo de prova
-- Regra: Se um CP de idade inferior atingir o FCK (Fcj >= Fck), os CPs de
-- idades superiores ficam "dispensados" (não precisam ser rompidos).
--
-- Exemplo: Se o CP de 7 dias atingir FCK, os de 28 e 63 dias ficam dispensados.
--          Se o CP de 7 dias NÃO atingir mas o de 28 dias atingir, o de 63 fica dispensado.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Atualizar vw_ensaios_concreto ============
-- Adiciona lógica de dispensa por atingimento precoce do FCK
-- DROP + CREATE porque PostgreSQL não permite alterar número de colunas com CREATE OR REPLACE

DROP VIEW IF EXISTS public.vw_rastreabilidade_concreto;
DROP VIEW IF EXISTS public.vw_ensaios_concreto;

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
    -- 1. Se algum CP de idade inferior na mesma carga já atingiu FCK, este CP é dispensado
    WHEN EXISTS (
      SELECT 1 FROM public.corpos_prova cp2
      JOIN public.ensaios_corpos_prova e2 ON e2.corpo_prova_id = cp2.id
      WHERE cp2.carga_id = cp.carga_id
        AND cp2.idade_prevista_dias < cp.idade_prevista_dias
        AND e2.resultado_mpa >= tc.fck_mpa
    ) THEN 'dispensado'
    -- 2. Lógica original: idade diferente da referência → não aplica
    WHEN cp.idade_prevista_dias <> COALESCE(cfg.idade_referencia_dias, 28) THEN 'nao_aplica'
    -- 3. Aguardando resultado
    WHEN e.resultado_mpa IS NULL THEN 'pendente'
    -- 4. Resultado atingiu FCK
    WHEN e.resultado_mpa >= tc.fck_mpa THEN 'conforme'
    -- 5. Resultado não atingiu FCK
    ELSE 'nao_conforme'
  END AS status_conformidade
FROM public.corpos_prova cp
JOIN public.cargas_concreto cc ON cc.id = cp.carga_id
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
LEFT JOIN public.laboratorios lab ON lab.id = cp.laboratorio_id
LEFT JOIN public.ensaios_corpos_prova e ON e.corpo_prova_id = cp.id
LEFT JOIN public.organizacoes_config_ensaio cfg ON cfg.organizacao_id = cp.organizacao_id;

GRANT SELECT ON public.vw_ensaios_concreto TO authenticated;

-- ============ 2. Atualizar vw_rastreabilidade_concreto ============
-- Atualiza agregação para considerar status 'dispensado' no cálculo geral

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
