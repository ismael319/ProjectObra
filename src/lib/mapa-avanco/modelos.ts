// Modelos de mapeamento: ponto de partida para uma grade nova.
//
// Cada serviço de obra tem sua própria escada de etapas, e montar cor por cor a
// cada grade é atrito puro. O modelo preenche etapas, forma e unidade de uma
// vez — e tudo continua editável antes de criar, além de poder ser alterado
// depois pelo editor de cores.
//
// Sobre os PESOS: não são divisões uniformes, e sim o quanto cada etapa
// representa do serviço pronto. Escavar uma estaca é o grosso do trabalho
// (0,6), enquanto curar um piso é só esperar (o salto de 0,8 para 1). É esse
// número que alimenta o percentual único usado no consolidado de grupo — a
// escada por etapa, que aparece na legenda, sai da `ordem`.

import type { StatusInput } from './mapa-db'

export interface ModeloGrade {
  label: string
  descricao: string
  forma: 'retangulo' | 'circulo'
  /** Unidade sugerida; a quantidade em si é sempre da obra. */
  unidade: string
  status: StatusInput[]
}

const CINZA = '#94a3b8'
const AMBAR = '#f59e0b'
const AZUL = '#3b82f6'
const VERDE = '#22c55e'
const VERMELHO = '#b43c3c'

export const MODELOS: Record<string, ModeloGrade> = {
  estacas: {
    label: 'Estacas',
    descricao: 'Escavada → concretada. Elementos pontuais, contados por unidade.',
    forma: 'circulo',
    unidade: 'un',
    status: [
      { chave: 'a_executar', label: 'A executar', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'escavada', label: 'Escavada', cor_hex: AMBAR, peso: 0.6, conta_no_calculo: true, ordem: 1 },
      { chave: 'concretada', label: 'Concretada', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 2 },
      { chave: 'cancelada', label: 'Cancelada', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  blocos: {
    label: 'Blocos de fundação',
    descricao: 'Escavado → forma montada → concretado.',
    forma: 'retangulo',
    unidade: 'un',
    status: [
      { chave: 'a_executar', label: 'A executar', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'escavado', label: 'Escavado', cor_hex: AMBAR, peso: 0.3, conta_no_calculo: true, ordem: 1 },
      { chave: 'forma_montada', label: 'Forma montada', cor_hex: AZUL, peso: 0.6, conta_no_calculo: true, ordem: 2 },
      { chave: 'concretado', label: 'Concretado', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 3 },
      { chave: 'cancelado', label: 'Cancelado', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  alvenaria: {
    label: 'Alvenaria',
    descricao: 'Levantada → rebocada. Medida por área de parede.',
    forma: 'retangulo',
    unidade: 'm²',
    status: [
      { chave: 'a_executar', label: 'A executar', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'levantada', label: 'Alvenaria levantada', cor_hex: AMBAR, peso: 0.6, conta_no_calculo: true, ordem: 1 },
      { chave: 'rebocada', label: 'Alvenaria rebocada', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 2 },
      { chave: 'nao_se_aplica', label: 'Não se aplica', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  premoldados: {
    label: 'Pré-moldados',
    descricao: 'Pilares montados → placas montadas. O pilar vem primeiro; a placa fecha o pano.',
    forma: 'retangulo',
    unidade: 'un',
    status: [
      { chave: 'a_montar', label: 'A montar', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'pilares_montados', label: 'Pilares montados', cor_hex: AMBAR, peso: 0.5, conta_no_calculo: true, ordem: 1 },
      { chave: 'placas_montadas', label: 'Placas montadas', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 2 },
      { chave: 'nao_se_aplica', label: 'Não se aplica', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  piso: {
    label: 'Piso (por área)',
    descricao: 'Concretado → curado. Praças coladas, medidas em m².',
    forma: 'retangulo',
    unidade: 'm²',
    status: [
      { chave: 'nao_iniciado', label: 'Não iniciado', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'concretado', label: 'Concretado', cor_hex: AMBAR, peso: 0.8, conta_no_calculo: true, ordem: 1 },
      { chave: 'curado', label: 'Curado (liberado)', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 2 },
      { chave: 'nao_recebe', label: 'Não recebe piso', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  telhas: {
    label: 'Telhas / cobertura (por área)',
    descricao: 'Instalada. Uma etapa só, medida em m² de cobertura.',
    forma: 'retangulo',
    unidade: 'm²',
    status: [
      { chave: 'a_instalar', label: 'A instalar', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'instalada', label: 'Instalada', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 1 },
      { chave: 'nao_se_aplica', label: 'Não se aplica', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },

  personalizado: {
    label: 'Personalizado',
    descricao: 'Duas etapas em branco para você nomear como quiser.',
    forma: 'retangulo',
    unidade: 'un',
    status: [
      { chave: 'pendente', label: 'Pendente', cor_hex: CINZA, peso: 0, conta_no_calculo: true, ordem: 0 },
      { chave: 'concluido', label: 'Concluído', cor_hex: VERDE, peso: 1, conta_no_calculo: true, ordem: 1 },
      { chave: 'nao_se_aplica', label: 'Não se aplica', cor_hex: VERMELHO, peso: 0, conta_no_calculo: false, ordem: 0 },
    ],
  },
}

/**
 * Um modelo só é utilizável se tiver estado inicial (a célula nunca clicada
 * precisa de um status) e ao menos uma etapa que gere percentual.
 */
export function modeloEhValido(modelo: ModeloGrade): boolean {
  const temInicial = modelo.status.some((s) => s.ordem === 0 && s.conta_no_calculo)
  const temAvanco = modelo.status.some((s) => s.ordem >= 1 && s.conta_no_calculo)
  const chavesUnicas = new Set(modelo.status.map((s) => s.chave)).size === modelo.status.length
  return temInicial && temAvanco && chavesUnicas
}
