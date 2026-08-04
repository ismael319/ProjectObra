-- Diagnóstico (somente leitura) — lista as Áreas que hoje estão dentro do setor
-- "729 001 FS FASE II CNP", pra identificar quais na verdade pertencem ao
-- cronograma 728 (que foi importado errado pra dentro desse setor por causa do
-- bug de colisão de código WBS, já corrigido no código).
-- Execute no Supabase SQL Editor e me mande o resultado.

SELECT
  s.nome AS setor,
  a.codigo AS area_codigo,
  a.nome AS area_nome,
  (SELECT count(*) FROM public.subareas sa WHERE sa.area_id = a.id) AS qtd_etapas
FROM public.areas a
JOIN public.setores s ON s.id = a.setor_id
WHERE s.nome ILIKE '%729%FASE II%' OR s.codigo = '1'
ORDER BY a.codigo;
