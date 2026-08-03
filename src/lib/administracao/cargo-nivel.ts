// "Nível" do cargo não é um campo próprio no banco — é extraído do sufixo
// do nome já cadastrado em rh_cargos (ex.: "Pedreiro I", "Eletricista Sr").
// Isso evita ter que reeditar cargo por cargo pra separar função de nível:
// quem já cadastrou "Pedreiro I/II/III" continua funcionando, e a
// agrupagem (30 pedreiros, independente do nível) fica automática.
// Usado tanto no Dashboard de Administração quanto no Histograma
// Planejado x Real (pra casar "Pedreiro" do Histograma com todos os
// níveis cadastrados em Funcionários).
const SUFIXO_NIVEL = /\s+(I{1,3}|IV|Jr\.?|Pl\.?|Sr\.?)$/i

/** "Pedreiro I" -> "Pedreiro". Sem sufixo reconhecido, devolve o nome como está. */
export function funcaoBase(nome: string): string {
  return nome.replace(SUFIXO_NIVEL, '').trim() || nome
}

/** "Pedreiro I" -> "I". Sem sufixo reconhecido, devolve null. */
export function nivelDoCargo(nome: string): string | null {
  const m = nome.match(SUFIXO_NIVEL)
  return m ? m[1].replace('.', '') : null
}
