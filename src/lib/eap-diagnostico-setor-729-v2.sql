-- Diagnóstico v2 (somente leitura) — mostra TODAS as colunas das áreas desse
-- setor, incluindo timestamp de criação (se existir). Os nomes das áreas não dão
-- pra distinguir 728 de 729 (é a mesma usina, fases diferentes), mas se elas
-- foram importadas em momentos diferentes, o timestamp separa os dois grupos.
-- Execute no Supabase SQL Editor e me mande o resultado.

SELECT *
FROM public.areas
WHERE setor_id = (SELECT id FROM public.setores WHERE nome ILIKE '%729%FASE II%' LIMIT 1)
ORDER BY codigo;
