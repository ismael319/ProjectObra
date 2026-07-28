import type { Equipe, Atividade } from './supabase';
import { parseDate, addDays, toISODate } from './dates';

export type Granularidade = 'dia' | 'semana' | 'mes';

export type HistogramaDia = {
  data: string;
  funcoes: Record<string, number>;
  totalGeral: number;
};

export type Histograma = Record<string, HistogramaDia>;

export function calcularHistograma(
  atividades: Atividade[],
  equipes: Equipe[],
  dataInicio: Date,
  dataFim: Date
): Histograma {
  const equipeMap = new Map(equipes.map((e) => [e.id, e]));
  const hist: Histograma = {};

  for (let d = new Date(dataInicio); d <= dataFim; d = addDays(d, 1)) {
    const iso = toISODate(d);
    const funcoes: Record<string, number> = {};
    atividades
      .filter((a) => {
        const ini = parseDate(a.data_inicio);
        const fim = parseDate(a.data_fim);
        return d >= ini && d <= fim;
      })
      .forEach((a) => {
        a.equipes_alocadas.forEach((eqId) => {
          const eq = equipeMap.get(eqId);
          if (!eq) return;
          eq.funcoes.forEach((f) => {
            const key = f.tipo || 'SEM FUNCAO';
            funcoes[key] = (funcoes[key] || 0) + f.quantidade;
          });
        });
      });
    const totalGeral = Object.values(funcoes).reduce((s, v) => s + v, 0);
    hist[iso] = { data: iso, funcoes, totalGeral };
  }
  return hist;
}

export function getFuncoes(equipes: Equipe[]): string[] {
  const set = new Set<string>();
  equipes.forEach((e) => {
    e.funcoes.forEach((f) => {
      if (f.tipo) set.add(f.tipo);
    });
  });
  return Array.from(set).sort();
}

export function getCapacidadeMaxima(funcao: string): number | null {
  const caps: Record<string, number> = {
    PARANÁ: 30,
    MARTINS: 20,
  };
  return caps[funcao] ?? null;
}

export type HistogramaEquipamentos = Record<string, { data: string; itens: Record<string, number>; totalGeral: number }>;

export function calcularHistogramaEquipamentos(
  atividades: Atividade[],
  equipes: Equipe[],
  dataInicio: Date,
  dataFim: Date
): HistogramaEquipamentos {
  const equipeMap = new Map(equipes.map((e) => [e.id, e]));
  const hist: HistogramaEquipamentos = {};

  for (let d = new Date(dataInicio); d <= dataFim; d = addDays(d, 1)) {
    const iso = toISODate(d);
    const itens: Record<string, number> = {};
    atividades
      .filter((a) => {
        const ini = parseDate(a.data_inicio);
        const fim = parseDate(a.data_fim);
        return d >= ini && d <= fim;
      })
      .forEach((a) => {
        a.equipes_alocadas.forEach((eqId) => {
          const eq = equipeMap.get(eqId);
          if (!eq) return;
          eq.equipamentos.forEach((eqp) => {
            const key = eqp.descricao || 'SEM EQUIPAMENTO';
            itens[key] = (itens[key] || 0) + eqp.quantidade;
          });
        });
      });
    const totalGeral = Object.values(itens).reduce((s, v) => s + v, 0);
    hist[iso] = { data: iso, itens, totalGeral };
  }
  return hist;
}

export function getEquipamentos(equipes: Equipe[]): string[] {
  const set = new Set<string>();
  equipes.forEach((e) => {
    e.equipamentos.forEach((eqp) => {
      if (eqp.descricao) set.add(eqp.descricao);
    });
  });
  return Array.from(set).sort();
}
