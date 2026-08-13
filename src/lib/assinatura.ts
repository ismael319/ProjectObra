// Assinatura do usuário — o nome dele desenhado numa letra cursiva escolhida no
// primeiro acesso (ver CompletarPerfil) e mostrada onde ele assina/valida algo.
//
// Guardamos só a ESCOLHA do estilo, nunca uma imagem: o nome corrigido no perfil
// se reflete na assinatura sozinho, e não custa espaço nem banda — o que importa
// num plano gratuito com 1 GB de arquivos e 5 GB de tráfego por mês.
//
// As três fontes são instaladas junto com o app (@fontsource), não baixadas de
// fora. Duas razões: a plataforma é usada em canteiro, muitas vezes com internet
// ruim; e a exportação de imagem/PDF captura a tela — uma fonte que não carregou
// sairia na letra padrão justo no documento que vai ser impresso e assinado.

export type AssinaturaEstilo = 'dancing' | 'vibes' | 'caveat'

export interface EstiloAssinatura {
  id: AssinaturaEstilo
  /** Rótulo pra tela de escolha — descreve o traço, não o nome da fonte. */
  rotulo: string
  /** Valor de font-family. As fontes vêm de @fontsource (ver main.tsx). */
  fontFamily: string
  /** Cada fonte tem altura de letra bem diferente pro mesmo font-size; sem esse
   * fator uma assinatura sairia miúda e outra estourando a linha. */
  escala: number
}

export const ESTILOS_ASSINATURA: EstiloAssinatura[] = [
  {
    id: 'dancing',
    rotulo: 'Cursiva inclinada',
    fontFamily: "'Dancing Script', cursive",
    escala: 1,
  },
  {
    id: 'vibes',
    rotulo: 'Cursiva clássica',
    fontFamily: "'Great Vibes', cursive",
    escala: 1.15,
  },
  {
    id: 'caveat',
    rotulo: 'Manuscrita',
    fontFamily: "'Caveat', cursive",
    escala: 1.1,
  },
]

export function estiloAssinatura(id: AssinaturaEstilo | null | undefined): EstiloAssinatura | null {
  if (!id) return null
  return ESTILOS_ASSINATURA.find((e) => e.id === id) ?? null
}

/**
 * O que mostrar como assinatura.
 *
 * Devolve `null` quando não há o que assinar (sem nome). Quem não escolheu
 * estilo — usuário de antes desta tela existir — tem `estilo: null`, e a tela
 * cai no nome em letra comum em vez de sumir com a autoria.
 */
/**
 * Data e hora de uma assinatura, a partir do `criado_em` da confirmação.
 *
 * `formatBR` (lib/utils) NÃO serve aqui: ele fatia a string por "-" esperando
 * só AAAA-MM-DD, então um timestamp do banco vira "13T14:30:00+00:00/08/2026".
 * A hora entra de propósito — num carimbo o que vale é o instante da decisão,
 * não só o dia.
 */
export function formatarDataAssinatura(iso: string | null | undefined): string {
  const texto = (iso ?? '').trim()
  if (!texto) return ''

  // Data pura (AAAA-MM-DD): `new Date` trata como meia-noite em UTC, e num fuso
  // a oeste (todo o Brasil) a exibição cai pro dia ANTERIOR — um carimbo de
  // 13/08 sairia como 12/08. Formata direto, sem passar por Date e sem hora.
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`

  const d = new Date(texto)
  if (Number.isNaN(d.getTime())) return ''
  // Com hora, o instante é convertido pro fuso de quem está vendo — o correto
  // pra um carimbo: mostra a hora local de quem lê o documento.
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface AssinaturaUsuario {
  id: string
  nome: string | null
  funcao: string | null
  assinatura_estilo: AssinaturaEstilo | null
}

export function resolverAssinatura(
  nome: string | null | undefined,
  estiloId: AssinaturaEstilo | null | undefined,
): { nome: string; estilo: EstiloAssinatura | null } | null {
  const limpo = (nome ?? '').trim()
  if (!limpo) return null
  return { nome: limpo, estilo: estiloAssinatura(estiloId) }
}
