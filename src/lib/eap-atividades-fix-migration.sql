-- Correção: PostgREST não encontra a coluna 'subarea_id' em 'atividades'
-- (erro ao mesclar Etapas: "Could not find the 'subarea_id' column of
-- 'atividades' in the schema cache"). Rode isto no SQL Editor do Supabase.

-- Garante que a coluna existe (idempotente — não faz nada se já existir).
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS subarea_id UUID REFERENCES public.subareas(id);

-- Caso o problema seja só o cache do PostgREST estar desatualizado (coluna já
-- existia, mas o PostgREST não recarregou o schema), força o reload.
NOTIFY pgrst, 'reload schema';
