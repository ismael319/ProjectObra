-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Corrige regressão: as migrations 20260807140000 (lógica de atingimento
-- FCK) e 20260807150000 (local de aplicação) recriaram
-- vw_rastreabilidade_concreto do zero (DROP + CREATE, necessário pra mudar
-- o Nº de colunas) e esqueceram de manter cod_laboratorio e dispensa_ensaio,
-- que tinham sido adicionadas por 20260807130000 — desde então a coluna
-- "Cod. Lab." em Ensaios/Rastreabilidade aparece vazia pra TODA carga, e
-- cargas marcadas como dispensadas de ensaio nunca aparecem como
-- "Dispensado" (status_geral cai sempre em "sem_cps"/"pendente").
--
-- Junta tudo: base + cod_laboratorio/dispensa_ensaio (130000) + local de
-- aplicação (150000).
--
-- Idempotente — seguro rodar mais de uma vez.

DROP VIEW IF EXISTS public.vw_rastreabilidade_concreto;

CREATE OR REPLACE VIEW public.vw_rastreabilidade_concreto WITH (security_invoker = true) AS
SELECT
  cc.id AS carga_id,
  cc.organizacao_id,
  cc.codigo_rastreabilidade,
  cc.data,
  cc.numero_carga,
  cc.nota_fiscal,
  cc.cod_laboratorio,
  cc.dispensa_ensaio,
  cc.quantidade_m3,
  cc.traco_id,
  tc.nome AS traco_nome,
  tc.fck_mpa,
  cc.fornecedor_id,
  fc.nome AS fornecedor_nome,
  -- Local de aplicação (primeiro destino da carga)
  setor.nome AS setor_nome,
  area.nome AS area_nome,
  etapa.nome AS etapa_nome,
  -- Agregados de corpos de prova
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
-- Local de aplicação (pega o primeiro destino da carga)
LEFT JOIN LATERAL (
  SELECT dc.setor_concreto_id, dc.area_concreto_id, dc.etapa_concreto_id
  FROM public.destinos_carga dc
  WHERE dc.carga_id = cc.id
  ORDER BY dc.id
  LIMIT 1
) dest ON true
LEFT JOIN public.setores_concreto setor ON setor.id = dest.setor_concreto_id
LEFT JOIN public.areas_concreto area ON area.id = dest.area_concreto_id
LEFT JOIN public.etapas_concreto etapa ON etapa.id = dest.etapa_concreto_id
GROUP BY cc.id, tc.nome, tc.fck_mpa, fc.nome, setor.nome, area.nome, etapa.nome;

GRANT SELECT ON public.vw_rastreabilidade_concreto TO authenticated;

NOTIFY pgrst, 'reload schema';
