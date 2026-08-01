// Versão em texto (formatação nativa do WhatsApp: *negrito*, _itálico_) do relatório
// visual (RelatorioVisual) da programação do dia — enviada direto na conversa, sem
// anexo, pra quem prefere não depender de baixar/abrir imagem ou PDF. Só existe pra
// programação do dia; a semanal (matriz por engenheiro) continua só como imagem/PDF —
// não cabe bem em texto corrido. Reaproveita os dados já agrupados por
// buildRelatorioVisual, só muda a saída (string em vez de card React).

import type { ActivityStatus } from "./adherence";
import type { RelatorioVisual } from "./relatorio-visual";

function emojiStatus(status: ActivityStatus): string {
  switch (status) {
    case "concluida":
      return "✅";
    case "parcial":
      return "🟡";
    case "nao_concluida":
      return "❌";
    default:
      return "⚪";
  }
}

export function buildTextoRelatorioVisual(params: {
  codigo: string;
  nomeProjeto: string;
  gestor?: string;
  tipo: string;
  dataLabel: string;
  relatorio: RelatorioVisual;
}): string {
  const { codigo, nomeProjeto, gestor, tipo, dataLabel, relatorio } = params;
  const linhas: string[] = [
    `📋 *${tipo}* · ${dataLabel}`,
    `${codigo} · ${nomeProjeto}${gestor ? ` · Gestor: ${gestor.toUpperCase()}` : ""}`,
    "",
  ];

  if (relatorio.totalAtividades === 0) {
    linhas.push("_Nenhuma atividade programada para este período._");
  } else {
    const aderencia = relatorio.aderenciaPct != null ? `${relatorio.aderenciaPct}%` : "—";
    linhas.push(`✅ ${relatorio.concluidas} concluídas   ❌ ${relatorio.naoConcluidas} não concluídas   📊 Aderência: ${aderencia}`, "");

    for (const area of relatorio.areas) {
      linhas.push(`*${area.nome}*`);
      for (const item of area.itens) {
        const emoji = item.isExtra ? "➕" : emojiStatus(item.status);
        linhas.push(`${emoji} ${item.nome}${item.isExtra ? " _(extra)_" : ""}`);
        for (const sub of item.subetapas) {
          linhas.push(`      ${sub.concluida ? "✅" : "⚪"} ${sub.nome}`);
        }
      }
      linhas.push("");
    }
  }

  linhas.push("_ProjectObra · gerado automaticamente_");
  return linhas.join("\n").trim();
}
