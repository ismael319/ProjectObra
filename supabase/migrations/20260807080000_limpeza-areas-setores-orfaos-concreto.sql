-- LIMPEZA — remove de "setores"/"areas" (catálogo global do Apontamento,
-- usado por "Distribuição Efetivo") os registros que só existem porque o
-- Lançamento de Concreto os criou automaticamente antes da separação (ver
-- 20260807060000_concreto-setores-areas-migration.sql e o diagnóstico
-- 20260807070000). O Concreto NÃO depende mais de setores/areas (usa
-- setores_concreto/areas_concreto, já copiados) — remover essas linhas daqui
-- não afeta o Lançamento de Concreto, só limpa o que sobrou pra Distribuição
-- Efetivo.
--
-- IRREVERSÍVEL. Confira o resultado de cada DELETE (a cláusula RETURNING
-- mostra exatamente o que foi removido) antes de considerar concluído — se
-- alguma linha ali não devia ter saído, restaure de um backup, não dá pra
-- desfazer só com SQL depois de commitado.
--
-- Critério (mesmo do diagnóstico, recalculado agora):
--   ÁREA candidata: nenhuma referência em nenhuma tabela com coluna
--     "area_id" além de destinos_carga (a antiga, sem uso pelo Concreto).
--   SETOR candidato: nenhuma referência em nenhuma tabela com coluna
--     "setor_id" além de destinos_carga E, depois de apagar as áreas
--     candidatas acima, nenhuma área remanescente dependendo dele.
--
-- Ordem importa: áreas antes de setores (área referencia setor via FK).
--
-- ============ 0. Solta o ponteiro ANTIGO das linhas já religadas ============
-- destinos_carga.area_id/setor_id (colunas antigas, sem FK ON DELETE
-- CASCADE) ainda apontam pras áreas/setores órfãos — sem isso o DELETE
-- abaixo quebra com "violates foreign key constraint" (já aconteceu ao
-- rodar sem esta etapa). Só zera o ponteiro antigo na linha que JÁ tem o
-- ponteiro NOVO preenchido (area_concreto_id/setor_concreto_id, gravado
-- pela religação em 20260807060000) — nada muda pro usuário, a tela já
-- prioriza area_concreto_id na exibição. Uma linha que por algum motivo
-- não foi religada MANTÉM o ponteiro antigo — protege a área/setor
-- correspondente de ser apagada por engano (o DELETE falha de novo pra
-- ela, em vez de silenciosamente perder a única referência que sobrava).

UPDATE public.destinos_carga SET area_id = NULL WHERE area_id IS NOT NULL AND area_concreto_id IS NOT NULL;
UPDATE public.destinos_carga SET setor_id = NULL WHERE setor_id IS NOT NULL AND setor_concreto_id IS NOT NULL;

DO $$
DECLARE
  col record;
  sql text;
BEGIN
  DROP TABLE IF EXISTS pg_temp.uso_area;
  CREATE TEMP TABLE uso_area (tabela text, valor_id uuid);

  FOR col IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'area_id' AND table_name <> 'areas'
  LOOP
    sql := format('INSERT INTO uso_area SELECT %L, area_id FROM public.%I WHERE area_id IS NOT NULL', col.table_name, col.table_name);
    EXECUTE sql;
  END LOOP;
END $$;

-- Remove as áreas órfãs (só usadas em destinos_carga, ou em lugar nenhum).
DELETE FROM public.areas a
WHERE NOT EXISTS (
  SELECT 1 FROM pg_temp.uso_area u WHERE u.valor_id = a.id AND u.tabela <> 'destinos_carga'
)
RETURNING a.id, a.nome; -- confira esta lista

-- Recalcula uso de setor DEPOIS de apagar as áreas órfãs (uma área que
-- sobreviveu conta como "setor em uso", mesmo sem nenhuma outra tabela
-- referenciar o setor diretamente).
DO $$
DECLARE
  col record;
  sql text;
BEGIN
  DROP TABLE IF EXISTS pg_temp.uso_setor;
  CREATE TEMP TABLE uso_setor (tabela text, valor_id uuid);

  FOR col IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'setor_id' AND table_name <> 'setores'
  LOOP
    sql := format('INSERT INTO uso_setor SELECT %L, setor_id FROM public.%I WHERE setor_id IS NOT NULL', col.table_name, col.table_name);
    EXECUTE sql;
  END LOOP;
END $$;

-- Remove os setores órfãos (só usados em destinos_carga/em nenhuma área
-- remanescente, ou em lugar nenhum).
DELETE FROM public.setores s
WHERE NOT EXISTS (
  SELECT 1 FROM pg_temp.uso_setor u WHERE u.valor_id = s.id AND u.tabela <> 'destinos_carga'
)
RETURNING s.id, s.nome; -- confira esta lista também
