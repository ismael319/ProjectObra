-- Diagnóstico (somente leitura) — confirma se "atividades" está sendo
-- compartilhada, sem querer, entre a EAP e o Gantt Livre.
-- Execute no Supabase SQL Editor e me mande os dois resultados.

-- 1) Todas as colunas da tabela hoje (deve mostrar colunas da EAP tipo
--    subarea_id/codigo/bloqueado E colunas do Gantt tipo scenario_id/
--    data_inicio/cor/ordem, tudo junto na mesma tabela).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'atividades'
ORDER BY ordinal_position;

-- 2) Quantas linhas têm cara de EAP (subarea_id preenchido) vs cara de
--    Gantt Livre (scenario_id preenchido) vs nenhum dos dois.
SELECT
  count(*) FILTER (WHERE subarea_id IS NOT NULL) AS linhas_com_subarea_id_eap,
  count(*) FILTER (WHERE scenario_id IS NOT NULL) AS linhas_com_scenario_id_gantt,
  count(*) FILTER (WHERE subarea_id IS NULL AND scenario_id IS NULL) AS linhas_sem_nenhum,
  count(*) AS total
FROM public.atividades;
