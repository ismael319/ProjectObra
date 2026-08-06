// Distribuição de corpos de prova (CPs) moldados por carga entre as idades
// de ensaio configuradas — ver organizacoes_config_ensaio (20260807040000_
// rastreabilidade-concreto-fundacao-migration.sql).

export type NovoCorpoProva = {
  idade_prevista_dias: number;
  data_moldagem: string; // "YYYY-MM-DD"
  data_ruptura_prevista: string; // "YYYY-MM-DD"
};

function somarDias(isoDate: string, dias: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

// Distribui `qtdCps` corpos de prova entre as `idades` informadas, em
// round-robin (6 CPs / [7,28,63] -> 2 de cada idade) — mesma prática padrão
// da empresa (pares por idade) citada no levantamento com o laboratório.
// Sobra (qtd não múltiplo da quantidade de idades) cai nas primeiras idades
// da lista.
export function distribuirCorposProva(idades: number[], qtdCps: number, dataMoldagem: string): NovoCorpoProva[] {
  if (idades.length === 0 || qtdCps <= 0 || !dataMoldagem) return [];
  const cps: NovoCorpoProva[] = [];
  for (let i = 0; i < qtdCps; i++) {
    const idade = idades[i % idades.length]!;
    cps.push({
      idade_prevista_dias: idade,
      data_moldagem: dataMoldagem,
      data_ruptura_prevista: somarDias(dataMoldagem, idade),
    });
  }
  return cps;
}

// "7, 28, 63" -> [7, 28, 63]. Ignora vazios/valores inválidos (0, negativo,
// não-numérico) — usado no campo de texto do formulário de lançamento.
export function parseIdadesEnsaio(texto: string): number[] {
  return texto
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}
