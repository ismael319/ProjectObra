export interface CameraMapaSetores {
  zoom: number
  x: number
  y: number
}

export interface DimensoesViewport {
  largura: number
  altura: number
}

export interface RetanguloMapa {
  x: number
  y: number
  w: number
  h: number
}

export const ZOOM_MINIMO_MAPA_SETORES = 1
export const ZOOM_MAXIMO_MAPA_SETORES = 3

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.max(minimo, Math.min(maximo, valor))
}

export function limitarCameraMapaSetores(
  camera: CameraMapaSetores,
  viewport: DimensoesViewport,
): CameraMapaSetores {
  const zoom = limitar(camera.zoom, ZOOM_MINIMO_MAPA_SETORES, ZOOM_MAXIMO_MAPA_SETORES)
  if (viewport.largura <= 0 || viewport.altura <= 0) return { zoom, x: 0, y: 0 }

  return {
    zoom,
    x: limitar(camera.x, viewport.largura - viewport.largura * zoom, 0),
    y: limitar(camera.y, viewport.altura - viewport.altura * zoom, 0),
  }
}

export function cameraParaEnquadrarMapaSetores(
  retangulo: RetanguloMapa,
  viewport: DimensoesViewport,
  margem = 0.88,
): CameraMapaSetores {
  if (retangulo.w <= 0 || retangulo.h <= 0 || viewport.largura <= 0 || viewport.altura <= 0) {
    return { zoom: ZOOM_MINIMO_MAPA_SETORES, x: 0, y: 0 }
  }

  const zoom = limitar(
    Math.min(viewport.largura / retangulo.w, viewport.altura / retangulo.h) * margem,
    ZOOM_MINIMO_MAPA_SETORES,
    ZOOM_MAXIMO_MAPA_SETORES,
  )

  return limitarCameraMapaSetores(
    {
      zoom,
      x: viewport.largura / 2 - (retangulo.x + retangulo.w / 2) * zoom,
      y: viewport.altura / 2 - (retangulo.y + retangulo.h / 2) * zoom,
    },
    viewport,
  )
}

export function cameraParaPontoMapaSetores(
  ponto: { x: number; y: number },
  viewport: DimensoesViewport,
  zoom = 1.6,
): CameraMapaSetores {
  return limitarCameraMapaSetores(
    {
      zoom,
      x: viewport.largura / 2 - ponto.x * zoom,
      y: viewport.altura / 2 - ponto.y * zoom,
    },
    viewport,
  )
}
