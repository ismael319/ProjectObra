import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload, CalendarClock, Sun, Cloud, CloudRain } from "lucide-react";

export type ChuvaStatus = "sem_chuva" | "parcial" | "constante";

const STATUS_CONFIG: Record<ChuvaStatus, { label: string; impacto: number; icon: typeof Sun; iconColor: string; bg: string }> = {
  sem_chuva: { label: "Sem chuva", impacto: 0, icon: Sun, iconColor: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300" },
  parcial: { label: "Chuva parcial (50%)", impacto: 0.5, icon: Cloud, iconColor: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" },
  constante: { label: "Chuva constante (100%)", impacto: 1, icon: CloudRain, iconColor: "text-red-500", bg: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300" },
};

// Ordem do ciclo ao clicar num dia: nenhum registro -> sem_chuva -> parcial -> constante -> volta a nenhum.
const CYCLE: ChuvaStatus[] = ["sem_chuva", "parcial", "constante"];

interface RegistroChuva {
  data: string;
  status: ChuvaStatus;
}

export default function MapaChuvas() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? null;
  const projetoId = currentProject?.id ?? null;
  const [month, setMonth] = useState<Date>(new Date());
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: registros = [] } = useQuery({
    queryKey: ["mapa_chuvas", organizacaoId, projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mapa_chuvas")
        .select("data,status")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .order("data");
      if (error) throw error;
      return data as RegistroChuva[];
    },
    enabled: !!organizacaoId && !!projetoId,
  });

  const registroByDate = useMemo(() => new Map(registros.map((r) => [r.data, r.status])), [registros]);

  // Média de HH-homem apontadas por dia (mesma base de dados usada na EAP: apontamentos
  // validados x horas do dia) — usada só pra converter "dias impactados" em horas
  // perdidas estimadas. Sem apontamentos, fica 0 (não tem base pra estimar).
  const { data: hhMedioDiario = 0 } = useQuery({
    queryKey: ["mapa_chuvas", "hh_medio_diario", organizacaoId, projetoId],
    queryFn: async () => {
      const { data: apontamentos } = await supabase
        .from("apontamentos_diarios")
        .select("data,total")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .eq("validado", true);
      const { data: dias } = await supabase
        .from("dias_trabalho")
        .select("data,horas_dia")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!);
      if (!apontamentos || apontamentos.length === 0) return 0;
      const horasDiaMap = new Map((dias ?? []).map((d: { data: string; horas_dia: number }) => [d.data, d.horas_dia]));
      const pessoasPorDia = new Map<string, number>();
      for (const a of apontamentos as { data: string; total: number }[]) {
        pessoasPorDia.set(a.data, (pessoasPorDia.get(a.data) ?? 0) + a.total);
      }
      let totalHH = 0;
      for (const [data, pessoas] of pessoasPorDia) totalHH += pessoas * (horasDiaMap.get(data) ?? 8);
      return pessoasPorDia.size > 0 ? totalHH / pessoasPorDia.size : 0;
    },
    enabled: !!organizacaoId && !!projetoId,
  });

  const setMut = useMutation({
    mutationFn: async ({ data, status }: { data: string; status: ChuvaStatus | null }) => {
      if (status === null) {
        const { error } = await supabase
          .from("mapa_chuvas")
          .delete()
          .eq("data", data)
          .eq("organizacao_id", organizacaoId!)
          .eq("projeto_id", projetoId!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mapa_chuvas")
          .upsert({ data, status, organizacao_id: organizacaoId, projeto_id: projetoId, atualizado_em: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mapa_chuvas", organizacaoId, projetoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDayClick = (dateStr: string) => {
    const current = registroByDate.get(dateStr) ?? null;
    const currentIdx = current ? CYCLE.indexOf(current) : -1;
    const nextIdx = currentIdx + 1;
    const next = nextIdx >= CYCLE.length ? null : CYCLE[nextIdx];
    setMut.mutate({ data: dateStr, status: next });
  };

  const stats = useMemo(() => {
    const diasRegistrados = registros.length;
    const diasImpactados = registros.reduce((s, r) => s + STATUS_CONFIG[r.status].impacto, 0);
    const pctImpacto = diasRegistrados > 0 ? (diasImpactados / diasRegistrados) * 100 : 0;
    return { diasRegistrados, diasImpactados, pctImpacto, hhImpacto: diasImpactados * hhMedioDiario };
  }, [registros, hhMedioDiario]);

  const exportCsv = () => {
    const header = "data,status\n";
    const rows = registros.map((r) => `${r.data},${r.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mapa-chuvas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.trim().split("\n").slice(1);
      const rows = lines
        .map((l) => {
          const [data, status] = l.split(",").map((s) => s.trim());
          return { data, status: status as ChuvaStatus };
        })
        .filter((r) => r.data && CYCLE.includes(r.status));
      if (rows.length === 0) throw new Error("Nenhum registro válido encontrado no arquivo (esperado: data,status)");
      const { error } = await supabase
        .from("mapa_chuvas")
        .upsert(rows.map((r) => ({ ...r, organizacao_id: organizacaoId, projeto_id: projetoId, atualizado_em: new Date().toISOString() })));
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} registro(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["mapa_chuvas", organizacaoId, projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weeks = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa de Chuvas</h1>
          <p className="text-sm text-muted-foreground">Registro diário de impacto de chuva na obra.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending}
          >
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importMut.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Dias registrados</div>
            <div className="text-2xl font-bold mt-1">{stats.diasRegistrados}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Dias impactados (equiv.)</div>
            <div className="text-2xl font-bold mt-1">{stats.diasImpactados.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">% Impacto</div>
            <div className="text-2xl font-bold mt-1">{stats.pctImpacto.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">HH impacto chuvas</div>
            <div className="text-2xl font-bold mt-1">{stats.hhImpacto.toFixed(1)} h</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              {CYCLE.map((status) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                return (
                  <span key={status} className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${cfg.iconColor}`} /> {cfg.label}
                  </span>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date())}>
              <CalendarClock className="h-4 w-4" /> Ir para data status
            </Button>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  ‹
                </Button>
                <span className="text-sm font-medium w-32 text-center">
                  {format(month, "MMM")} {month.getFullYear()}
                </span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  ›
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {weeks.map((w) => (
                  <div key={w} className="text-xs text-muted-foreground font-medium py-1">{w}</div>
                ))}
                {buildMonthGrid(month).map((day, i) => {
                  if (!day) return <div key={i} />;
                  const dateStr = format(day, "yyyy-MM-dd");
                  const status = registroByDate.get(dateStr);
                  const cfg = status ? STATUS_CONFIG[status] : null;
                  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDayClick(dateStr)}
                      className={`h-10 rounded-md text-sm font-medium transition ${
                        cfg ? cfg.bg : isToday ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" : "hover:bg-muted"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Clique em um dia do calendário para marcar ou alterar o status.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function buildMonthGrid(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, m, d));
  return grid;
}
