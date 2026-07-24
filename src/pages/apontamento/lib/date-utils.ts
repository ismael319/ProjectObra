export function toAnoMes(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function toAnoSemana(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const { year, week } = isoWeek(new Date(y, m - 1, d));
  return `${year}-${String(week).padStart(2, "0")}`;
}

export function formatBR(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeApontamento(payload: Record<string, any>): Record<string, any> {
  const p = { ...payload };
  p.total = (p.pedreiro ?? 0) + (p.servente ?? 0) + (p.carpinteiro ?? 0) + (p.qntdd_funcao ?? 0);
  p.ano_mes = toAnoMes(p.data);
  p.ano_semana = toAnoSemana(p.data);
  p.atualizado_em = new Date().toISOString();
  return p;
}
