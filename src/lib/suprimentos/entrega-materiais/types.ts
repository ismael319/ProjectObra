export interface Frente {
  id: string
  nome: string
  ativo: boolean
}

export interface ItemLista {
  id: string
  frenteId: string
  marcaConjunto: string
  descricao: string
  dimensoes: string | null
  qtdPlanejada: number
  pesoUnitarioKg: number
  pesoTotalPlanejadoKg: number
}

export interface ItemProgresso extends ItemLista {
  qtdEntregue: number
  pesoEntregueKg: number
  pctQtdEntregue: number | null
  pctPesoEntregue: number | null
  excedente: boolean
}

export interface LinhaImportada {
  linha: number
  marcaConjunto: string
  descricao: string
  dimensoes: string
  qtdPlanejada: number
  pesoUnitarioKg: number
}
