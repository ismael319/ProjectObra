function urlSegura(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  try {
    const url = new URL(valor)
    // Só http(s) — bloqueia javascript:/data: e afins num campo que veio de
    // um jsonb livre (parametros), preenchido por quem tem papel edicao.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export default function SlideCustomUrl({ parametros }: { parametros: Record<string, unknown> }) {
  const url = urlSegura(parametros.url)

  if (!url) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-950 text-white/40">URL não configurada.</div>
  }

  return <iframe src={url} title="Slide personalizado" className="w-full h-full border-0" />
}
