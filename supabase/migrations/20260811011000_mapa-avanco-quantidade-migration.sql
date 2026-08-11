-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Quantidade real por grade no módulo Gestão à Vista.
--
-- A grade é uma malha arbitrária: dividir um telhado em 100 quadrados é uma
-- escolha de desenho, não uma medida. Quem lê o avanço na obra quer saber
-- "quantos m² de telhado já estão prontos", não "quantos quadradinhos".
--
-- Informando que a grade inteira representa 150 m², o percentual passa a ser
-- convertido: 30% viram 45 m². Ambos os campos são opcionais — grade sem
-- quantidade continua mostrando só o percentual e a contagem de células, como
-- antes.
--
-- A quantidade se refere ao que ENTRA no cálculo: se 10 das 100 células estão
-- marcadas como "não se aplica", os 150 m² são das 90 restantes.
--
-- Idempotente — seguro rodar mais de uma vez.

ALTER TABLE public.mapa_grades
  ADD COLUMN IF NOT EXISTS quantidade_total numeric,
  ADD COLUMN IF NOT EXISTS unidade text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_grades_quantidade_positiva') THEN
    ALTER TABLE public.mapa_grades
      ADD CONSTRAINT mapa_grades_quantidade_positiva
      CHECK (quantidade_total IS NULL OR quantidade_total > 0);
  END IF;

  -- Quantidade sem unidade viraria um número solto na tela ("45" de quê?).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mapa_grades_unidade_com_quantidade') THEN
    ALTER TABLE public.mapa_grades
      ADD CONSTRAINT mapa_grades_unidade_com_quantidade
      CHECK (quantidade_total IS NULL OR nullif(trim(unidade), '') IS NOT NULL);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
