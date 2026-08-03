-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS administracao-schema-migration.sql
--
-- Liga cada funcionário a um projeto (projetos.id) além do já existente
-- obra_codigo (texto livre, sem relação com o cadastro de projetos). Isso
-- permite ao módulo "Histograma Planejado x Real" (histograma_cargos /
-- histograma_real_semanal, por projeto_id) mostrar quantos funcionários
-- cadastrados de um cargo estão hoje naquele projeto, como referência ao
-- lançar o apontamento semanal — histograma-mo-migration.sql.
--
-- Nullable e ON DELETE SET NULL: nem todo funcionário precisa estar
-- vinculado a um projeto (ex.: administrativo, alojamento), e apagar um
-- projeto não pode apagar o cadastro do funcionário.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS funcionarios_projeto_idx ON public.funcionarios (projeto_id);

NOTIFY pgrst, 'reload schema';
