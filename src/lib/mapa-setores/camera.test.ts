import { describe, expect, it } from 'vitest'
import {
  cameraParaEnquadrarMapaSetores,
  cameraParaPontoMapaSetores,
  limitarCameraMapaSetores,
} from './camera'

const viewport = { largura: 1000, altura: 600 }

describe('limitarCameraMapaSetores', () => {
  it('mantém o zoom entre 100% e 300% e evita áreas vazias no pan', () => {
    expect(limitarCameraMapaSetores({ zoom: 4, x: 900, y: -2200 }, viewport)).toEqual({ zoom: 3, x: 0, y: -1200 })
    expect(limitarCameraMapaSetores({ zoom: 2, x: -1400, y: 300 }, viewport)).toEqual({ zoom: 2, x: -1000, y: 0 })
  })
})

describe('cameraParaEnquadrarMapaSetores', () => {
  it('centraliza a área selecionada e aplica margem antes do limite máximo', () => {
    expect(cameraParaEnquadrarMapaSetores({ x: 400, y: 200, w: 200, h: 200 }, viewport)).toEqual({
      zoom: 2.64,
      x: -820,
      y: -492,
    })
  })

  it('mantém o enquadramento total no mínimo de 100%', () => {
    expect(cameraParaEnquadrarMapaSetores({ x: 0, y: 0, w: 1000, h: 600 }, viewport)).toEqual({ zoom: 1, x: 0, y: 0 })
  })
})

describe('cameraParaPontoMapaSetores', () => {
  it('centraliza um ponto com a aproximação padrão', () => {
    expect(cameraParaPontoMapaSetores({ x: 500, y: 300 }, viewport)).toEqual({ zoom: 1.6, x: -300, y: -180 })
  })
})
