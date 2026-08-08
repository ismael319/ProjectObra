-- Adiciona cc.cod_laboratorio à view vw_ensaios_concreto pra exportação de
-- ensaios incluir o código do laboratório da carga.
-- Idempotente — seguro rodar mais de uma vez.

CREATE OR REPLACE VIEW public.vw_ensaios_concreto WITH (security_invoker = true) AS
SELECT
  cp.id AS corpo_prova_id,
  cp.organizacao_id,
  cp.carga_id,
  cc.codigo_rastreabilidade,
  cc.data AS data_carga,
  cc.numero_carga,
  cc.nota_fiscal,
  cc.cod_laboratorio,
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

NOTIFY pgrst, 'reload schema';
