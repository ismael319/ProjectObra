import { describe, expect, it } from 'vitest'
import { buildNavSections, getDashboardRouteTitle, getNavItemDestination, navSectionsInsercaoPontual } from './nav-config'

describe('nav-config', () => {
  it('expõe somente os módulos contratados', () => {
    const sections = buildNavSections(['engenharia', 'qualidade'])

    expect(sections.map((section) => section.title)).toEqual(['SIGA Planejamento', 'SIGA Execução', 'SIGA CONCRETO'])
    expect(sections[2].items[0].children?.[0].path).toBe('/dashboard/qualidade/concreto/dashboard')
  })

  it('lista os itens de Planejamento direto na seção, incluindo o Histograma e a EAP', () => {
    const sections = buildNavSections(['engenharia'])

    expect(sections[0].title).toBe('SIGA Planejamento')
    expect(sections[0].items.map((item) => item.path)).toEqual([
      '/dashboard/planning',
      '/dashboard/daily',
      '/dashboard/gantt',
      '/dashboard/histograma-mo',
      '/dashboard/people/eap',
    ])
    expect(sections[0].items.every((item) => !item.children)).toBe(true)
  })

  it('mantém o apontador restrito ao lançamento de efetivo', () => {
    expect(navSectionsInsercaoPontual[0].items).toHaveLength(1)
    expect(navSectionsInsercaoPontual[0].items[0].path).toBe('/dashboard/people/lancamento')
  })

  it('usa destino alternativo somente para agrupadores sem página própria', () => {
    const sections = buildNavSections(['engenharia', 'qualidade'])
    const efetivo = sections[1].items[0]
    const concreto = sections[2].items[0]

    expect(getNavItemDestination(efetivo)).toBe('/dashboard/people')
    expect(getNavItemDestination(concreto)).toBe('/dashboard/qualidade/concreto/dashboard')
  })

  it('resolve títulos específicos sem tratar rota desconhecida como visão geral', () => {
    expect(getDashboardRouteTitle('/dashboard')).toBe('Visão Geral')
    expect(getDashboardRouteTitle('/dashboard/seguranca/registros/123')).toBe('Registros de Segurança')
    expect(getDashboardRouteTitle('/dashboard/rota-inexistente')).toBe('SIGA SOLUÇÕES')
  })
})
