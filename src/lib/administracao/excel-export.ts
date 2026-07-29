import * as XLSX from "xlsx";
import type { FuncionarioRow, Local, StatusBdr, StatusFs } from "./db";

const LOCAL_LABEL: Record<Local, string> = {
  obra: "Obra",
  alojamento: "Alojamento",
  em_viagem: "Em viagem",
  turno_noite: "Turno à noite",
};

const STATUS_BDR_LABEL: Record<StatusBdr, string> = {
  liberado_fs: "Liberado FS",
  integracao: "Integração",
  aguardando_documentacao: "Aguardando documentação",
};

const STATUS_FS_LABEL: Record<StatusFs, string> = {
  liberado: "Liberado",
  bloqueado: "Bloqueado",
};

const HEADERS = [
  "MAT", "NOME", "CARGO", "SETOR", "ENCARREGADO", "INDICAÇÃO", "ADMISSÃO",
  "CATEGORIA", "CPF", "OBRA", "LOCAL", "STATUS BDR", "STATUS FS", "GRUPO",
];

type Nomes = {
  cargo: Map<string, string>;
  setor: Map<string, string>;
  encarregado: Map<string, string>;
  grupo: Map<string, string>;
};

function autoSizeFromRows(rows: (string | number)[][]) {
  if (rows.length === 0) return [];
  return rows[0]!.map((_, idx) => {
    let max = 8;
    for (const r of rows) {
      const v = r[idx];
      const s = v == null ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(max + 2, 40) };
  });
}

export function buildFuncionariosWorkbook(funcionarios: FuncionarioRow[], nomes: Nomes): XLSX.WorkBook {
  const linhas: (string | number)[][] = [HEADERS];
  for (const f of funcionarios) {
    linhas.push([
      f.matricula,
      f.nome,
      f.cargo_id ? nomes.cargo.get(f.cargo_id) ?? "" : "",
      f.setor_id ? nomes.setor.get(f.setor_id) ?? "" : "",
      f.encarregado_id ? nomes.encarregado.get(f.encarregado_id) ?? "" : "",
      f.indicacao ?? "",
      f.data_admissao,
      f.categoria ?? "",
      f.cpf ?? "",
      f.obra_codigo ?? "",
      f.local ? LOCAL_LABEL[f.local] : "",
      STATUS_BDR_LABEL[f.status_bdr],
      STATUS_FS_LABEL[f.status_fs],
      f.grupo_id ? nomes.grupo.get(f.grupo_id) ?? "" : "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = autoSizeFromRows(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Funcionários");
  return wb;
}

export function downloadFuncionariosWorkbook(wb: XLSX.WorkBook) {
  const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("");
  XLSX.writeFile(wb, `Controle_de_Efetivo_${hoje}.xlsx`);
}
