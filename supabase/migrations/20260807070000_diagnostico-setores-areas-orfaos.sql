-- DIAGNÓSTICO — SÓ LEITURA, não apaga nada. Execute no SQL Editor do
-- Supabase e revise o resultado antes de decidir o que remover.
--
-- Contexto: até 20260807060000_concreto-setores-areas-migration.sql, o
-- Lançamento de Concreto usava os MESMOS setores/areas globais da
-- "Distribuição Efetivo" (Apontamento) — alguns setores/áreas que aparecem
-- hoje em Distribuição Efetivo podem ter sido criados só porque alguém
-- lançou uma carga de concreto num nome que não existia ainda (o resolvedor
-- do importador criava o setor/área na hora, ver ResolvedorDeAreas em
-- importer-db.ts, ANTES da separação).
--
-- Como não dá pra ter certeza só lendo os arquivos de migration se existe
-- alguma tabela criada direto no Supabase (antes de versionar migrations)
-- que também referencia setores/areas, esta consulta varre TODAS as colunas
-- chamadas "setor_id"/"area_id" que existem DE VERDADE no banco agora
-- (via information_schema, não via arquivo) — cobre qualquer tabela, mesmo
-- uma que eu não tenha visto no histórico de migrations.
--
-- Resultado: uma linha por setor/área, com quantas vezes cada um é
-- referenciado em CADA tabela que tem uma coluna setor_id/area_id. Um
-- setor/área que só aparece em "destinos_carga" (a coluna antiga, já
-- descontinuada pelo Concreto) e em mais nenhuma outra tabela é um forte
-- candidato a ter sido criado só pelo Concreto — mas confira à mão antes de
-- apagar (esta consulta não sabe distinguir um setor real que por
-- coincidência nunca foi usado em nada ainda).

DO $$
DECLARE
  col record;
  sql text;
BEGIN
  DROP TABLE IF EXISTS pg_temp.uso_setor_area;
  CREATE TEMP TABLE uso_setor_area (
    tabela text,
    coluna text,
    valor_id uuid
  );

  FOR col IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('setor_id', 'area_id')
      AND table_name NOT IN ('setores', 'areas') -- exclui os próprios catálogos (auto-referência não conta como "uso")
  LOOP
    sql := format(
      'INSERT INTO uso_setor_area SELECT %L, %L, %I FROM public.%I WHERE %I IS NOT NULL',
      col.table_name, col.column_name, col.column_name, col.table_name, col.column_name
    );
    EXECUTE sql;
  END LOOP;
END $$;

-- ============ Setores ============
SELECT
  'SETOR' AS tipo,
  s.id,
  s.nome,
  s.ativo,
  COALESCE(jsonb_object_agg(u.tabela || '.' || u.coluna, u.total) FILTER (WHERE u.tabela IS NOT NULL), '{}'::jsonb) AS usado_em,
  COUNT(u.tabela) FILTER (WHERE u.tabela <> 'destinos_carga') AS usos_fora_do_concreto
FROM public.setores s
LEFT JOIN (
  SELECT tabela, coluna, valor_id, COUNT(*) AS total
  FROM pg_temp.uso_setor_area
  GROUP BY tabela, coluna, valor_id
) u ON u.valor_id = s.id
GROUP BY s.id, s.nome, s.ativo
ORDER BY usos_fora_do_concreto ASC, s.nome;

-- ============ Áreas ============
SELECT
  'AREA' AS tipo,
  a.id,
  a.nome,
  a.ativo,
  COALESCE(jsonb_object_agg(u.tabela || '.' || u.coluna, u.total) FILTER (WHERE u.tabela IS NOT NULL), '{}'::jsonb) AS usado_em,
  COUNT(u.tabela) FILTER (WHERE u.tabela <> 'destinos_carga') AS usos_fora_do_concreto
FROM public.areas a
LEFT JOIN (
  SELECT tabela, coluna, valor_id, COUNT(*) AS total
  FROM pg_temp.uso_setor_area
  GROUP BY tabela, coluna, valor_id
) u ON u.valor_id = a.id
GROUP BY a.id, a.nome, a.ativo
ORDER BY usos_fora_do_concreto ASC, a.nome;
