import { describe, it, expect } from 'vitest'
import {
  ESTILOS_ASSINATURA,
  estiloAssinatura,
  formatarDataAssinatura,
  resolverAssinatura,
} from './assinatura'

describe('formatarDataAssinatura', () => {
  it('formata um timestamp do banco em dd/mm/aaaa hh:mm', () => {
    // formatBR (lib/utils) fatiava por "-" e devolvia "13T14:30:00+00:00/08/2026"
    // pra este mesmo valor — o carimbo saía com lixo no lugar da data.
    //
    // Sem fixar a hora do relógio: um instante com fuso é exibido no fuso de
    // quem lê, então o teste travaria no fuso da máquina que roda a suíte.
    const texto = formatarDataAssinatura('2026-08-13T14:30:00-03:00')
    expect(texto).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/)
  })

  it('uma hora depois aparece uma hora depois', () => {
    const a = formatarDataAssinatura('2026-08-13T10:00:00Z')
    const b = formatarDataAssinatura('2026-08-13T11:00:00Z')
    expect(a).not.toBe(b)
  })

  it('data sem hora não escorrega pro dia anterior', () => {
    // `new Date('2026-08-13')` é meia-noite UTC; em qualquer fuso do Brasil
    // (a oeste) isso exibiria 12/08. Sem hora, não há o que converter.
    expect(formatarDataAssinatura('2026-08-13')).toBe('13/08/2026')
  })

  it('vazio e inválido não quebram a tela', () => {
    expect(formatarDataAssinatura(null)).toBe('')
    expect(formatarDataAssinatura(undefined)).toBe('')
    expect(formatarDataAssinatura('')).toBe('')
    expect(formatarDataAssinatura('nao é data')).toBe('')
  })
})

describe('resolverAssinatura', () => {
  it('devolve nome e estilo quando os dois existem', () => {
    const r = resolverAssinatura('Eduardo Limberger', 'caveat')
    expect(r?.nome).toBe('Eduardo Limberger')
    expect(r?.estilo?.id).toBe('caveat')
  })

  it('sem nome não há assinatura', () => {
    expect(resolverAssinatura(null, 'caveat')).toBeNull()
    expect(resolverAssinatura('   ', 'caveat')).toBeNull()
  })

  it('usuário antigo, sem estilo escolhido, mantém o nome', () => {
    // Some com a assinatura, mas nunca com a autoria: quem validou continua
    // identificado, só que em letra comum.
    const r = resolverAssinatura('Ana Souza', null)
    expect(r?.nome).toBe('Ana Souza')
    expect(r?.estilo).toBeNull()
  })

  it('estilo desconhecido (dado velho ou digitado à mão) não vira fonte errada', () => {
    const r = resolverAssinatura('Ana Souza', 'comic-sans' as never)
    expect(r?.estilo).toBeNull()
  })

  it('tira espaços das pontas do nome', () => {
    expect(resolverAssinatura('  Ana  ', 'dancing')?.nome).toBe('Ana')
  })
})

describe('ESTILOS_ASSINATURA', () => {
  it('são exatamente os três aceitos pelo banco', () => {
    // O CHECK da migration só admite estes; um id novo aqui sem migration
    // quebraria o salvamento na tela de primeiro acesso.
    expect(ESTILOS_ASSINATURA.map((e) => e.id)).toEqual(['dancing', 'vibes', 'caveat'])
  })

  it('cada estilo resolve pra si mesmo', () => {
    for (const e of ESTILOS_ASSINATURA) {
      expect(estiloAssinatura(e.id)?.id).toBe(e.id)
    }
  })

  it('nenhum estilo fica sem fonte ou sem escala', () => {
    for (const e of ESTILOS_ASSINATURA) {
      expect(e.fontFamily).toBeTruthy()
      expect(e.escala).toBeGreaterThan(0)
    }
  })
})
