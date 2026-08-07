-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS 20260807120000_vw-rastreabilidade-cod-laboratorio-migration.sql
--
-- Nem toda carga precisa de ensaio de compressão axial (depende do uso do
-- concreto) — "dispensa_ensaio" marca essas cargas pra elas não aparecerem
-- como pendência no calendário de rastreabilidade (ver Ensaios/
-- Rastreabilidade > calendário: dia fica verde quando toda carga do dia ou
-- já tem corpo de prova vinculado, ou foi marcada como dispensada).
--
-- Idempotente — seguro rodar mais de uma vez.

ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS dispensa_ensaio boolean NOT NULL DEFAULT false;

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
  cc.cod_laboratorio,
  cc.dispensa_ensaio
FROM public.cargas_concreto cc
JOIN public.tracos_concreto tc ON tc.id = cc.traco_id
JOIN public.fornecedores_concreto fc ON fc.id = cc.fornecedor_id
LEFT JOIN public.corpos_prova cp ON cp.carga_id = cc.id
GROUP BY cc.id, tc.nome, tc.fck_mpa, fc.nome;

GRANT SELECT ON public.vw_rastreabilidade_concreto TO authenticated;

NOTIFY pgrst, 'reload schema';
