-- Adiciona coluna `cor` para cor customizada do setor.
-- Quando definida, sobrepõe a cor derivada do engenheiro.
ALTER TABLE mapa_setores_marcadores
  ADD COLUMN IF NOT EXISTS cor text;
