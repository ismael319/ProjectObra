-- Renumera o Código EAP de TODAS as atividades pro padrão AT01, AT02, AT03...
-- (mesmo padrão que a EAP e a tela de Cadastro já sugerem automaticamente pra
-- itens novos). Ordena por nome, pra ficar previsível.
--
-- ATENÇÃO: os códigos atuais (ex.: "1.18.8") vêm do WBS do cronograma importado
-- e são usados pela tela "Importar EAP" pra detectar duplicados numa
-- reimportação futura do mesmo cronograma. Depois de rodar isto, uma
-- reimportação do mesmo cronograma pode não reconhecer essas atividades como
-- já existentes (o código WBS original não vai mais bater) e criar duplicados.
-- Rode só se tiver ciente disso.
--
-- Execute esta query no Supabase SQL Editor.

WITH ordenado AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome) AS rn
  FROM public.atividades
)
UPDATE public.atividades a
SET codigo = 'AT' || LPAD(o.rn::text, 2, '0')
FROM ordenado o
WHERE a.id = o.id;
