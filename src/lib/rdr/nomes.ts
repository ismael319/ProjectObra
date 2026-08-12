const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function capitalizarParte(palavra: string): string {
  const separadores = /[._-]+/
  return palavra
    .split(separadores)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ")
}

// Converte um email em um nome legível (ex.: "ale.wanderley@hotmail.com" →
// "Ale Wanderley"). Texto que não parece email retorna sem alteração.
export function nomeAmigavel(nomeOuEmail: string): string {
  const v = (nomeOuEmail ?? "").trim()
  if (!v) return ""
  if (!PARECE_EMAIL.test(v)) return v
  const parte = v.split("@")[0] ?? ""
  if (!parte) return v
  return capitalizarParte(parte)
}
