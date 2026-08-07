-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260807110000_cargas-concreto-cod-laboratorio-migration.sql
--
-- Expõe cargas_concreto.cod_laboratorio na view de rastreabilidade (ver essa
-- migration pro porquê do campo) — mesmo texto de
-- 20260807050000_rastreabilidade-concreto-views-migration.sql, só adiciona
-- a coluna nova. Idempotente — seguro rodar mais de uma vez.

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
  ) AS status_conformidade_geral,
  cc.cod_laboratorio
FROM public.cargas_concreto cc
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
JOIN public.fornecedores_concreto fc ON fc.id = cc.fornecedor_id
LEFT JOIN public.corpos_prova cp ON cp.carga_id = cc.id
GROUP BY cc.id, tc.nome, tc.fck_mpa, fc.nome;

GRANT SELECT ON public.vw_rastreabilidade_concreto TO authenticated;

NOTIFY pgrst, 'reload schema';
