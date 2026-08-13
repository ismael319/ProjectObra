import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "./lib/date-utils";
import { CHART_COLORS } from "@/lib/chart-colors";
import {
  useEmpresas, useLiderancas, useSetores, useAreas, useSubareas, useAtividades,
} from "./lib/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useMediaQuery } from "@/lib/use-media-query";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";

const COLORS = CHART_COLORS;

export default function EvolucaoPage() {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? null;
  const projetoId = currentProject?.id ?? null;
  const [dataInicio, setDataInicio] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); });
  const [dataFim, setDataFim] = useState(todayISO());
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [liderancaId, setLiderancaId] = useState<string | null>(null);
  const [setorId, setSetorId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [subareaId, setSubareaId] = useState<string | null>(null);
  const [atividadeId, setAtividadeId] = useState<string | null>(null);

  const { data: empresas = [] } = useEmpresas(false);
  const { data: liderancas = [] } = useLiderancas(false);
  const { data: setores = [] } = useSetores(false);
  const { data: areas = [] } = useAreas(setorId, false);
  const { data: subareas = [] } = useSubareas(areaId, false);
  const { data: atividades = [] } = useAtividades(false);

  const { data: apontamentos = [] } = useQuery({
    queryKey: ["evolucao", organizacaoId, projetoId, dataInicio, dataFim, empresaId, liderancaId, setorId, areaId, subareaId, atividadeId],
    queryFn: async () => {
      let q = supabase
        .from("apontamentos_diarios")
        .select("data,ano_semana,setor_nome,area_nome,subarea_nome,atividade_nome,empresa_nome,pedreiro,servente,carpinteiro,qntdd_funcao,total")
        .eq("organizacao_id", organizacaoId!)
        .eq("projeto_id", projetoId!)
        .gte("data", dataInicio)
        .lte("data", dataFim);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      if (liderancaId) q = q.eq("lideranca_id", liderancaId);
      if (setorId) q = q.eq("setor_id", setorId);
      if (areaId) q = q.eq("area_id", areaId);
      if (subareaId) q = q.eq("subarea_id", subareaId);
      if (atividadeId) q = q.eq("atividade_id", atividadeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizacaoId && !!projetoId,
  });
  const porSemana = useMemo(() => {
    const map = new Map<string, { semana: string; total: number; pedreiro: number; servente: number; carpinteiro: number; outros: number }>();
    for (const a of apontamentos) {
      const existing = map.get(a.ano_semana);
      if (existing) { existing.total += a.total; existing.pedreiro += a.pedreiro; existing.servente += a.servente; existing.carpinteiro += a.carpinteiro; existing.outros += a.qntdd_funcao; }
      else map.set(a.ano_semana, { semana: a.ano_semana, total: a.total, pedreiro: a.pedreiro, servente: a.servente, carpinteiro: a.carpinteiro, outros: a.qntdd_funcao });
    }
    return [...map.values()].sort((a, b) => a.semana.localeCompare(b.semana));
  }, [apontamentos]);

  const topAtividades = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of apontamentos) map.set(a.atividade_nome, (map.get(a.atividade_nome) ?? 0) + a.total);
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [apontamentos]);

  const topSetores = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of apontamentos) map.set(a.setor_nome, (map.get(a.setor_nome) ?? 0) + a.total);
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [apontamentos]);
  const atividadesGrafico = isMobile ? topAtividades.slice(0, 5) : topAtividades;
  const setoresGrafico = isMobile ? topSetores.slice(0, 5) : topSetores;
  const intervaloSemanas = isMobile ? Math.max(0, Math.ceil(porSemana.length / 5) - 1) : 0;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Evolução do Projeto</h1><p className="text-sm text-muted-foreground">Acompanhe a evolução semanal da mão de obra.</p></div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5"><Label>Data início</Label><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Data fim</Label><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Empresa</Label><Combobox options={empresas.map((e) => ({ value: e.id, label: e.nome }))} value={empresaId} onChange={setEmpresaId} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Liderança</Label><Combobox options={liderancas.map((l) => ({ value: l.id, label: l.nome, group: l.tipo }))} value={liderancaId} onChange={setLiderancaId} placeholder="Todas" /></div>
            <div className="space-y-1.5"><Label>Setor</Label><Combobox options={setores.map((s) => ({ value: s.id, label: s.nome }))} value={setorId} onChange={(v) => { setSetorId(v); setAreaId(null); setSubareaId(null); }} placeholder="Todos" /></div>
            <div className="space-y-1.5"><Label>Área</Label><Combobox options={areas.map((a) => ({ value: a.id, label: a.nome }))} value={areaId} onChange={(v) => { setAreaId(v); setSubareaId(null); }} placeholder="Todas" disabled={!setorId} /></div>
            <div className="space-y-1.5"><Label>Etapa</Label><Combobox options={subareas.map((s) => ({ value: s.id, label: s.nome }))} value={subareaId} onChange={setSubareaId} placeholder="Todas" disabled={!areaId} /></div>
            <div className="space-y-1.5"><Label>Atividade</Label><Combobox options={atividades.map((a) => ({ value: a.id, label: a.nome }))} value={atividadeId} onChange={setAtividadeId} placeholder="Todas" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Evolução Semanal</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={isMobile ? 250 : 400}>
            <BarChart data={porSemana} margin={isMobile ? { top: 0, right: 4, left: -24, bottom: 0 } : undefined}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="semana" tick={{ fontSize: isMobile ? 9 : 11 }} interval={isMobile ? intervaloSemanas : undefined} />
              <YAxis tick={{ fontSize: isMobile ? 9 : 12 }} tickCount={isMobile ? 4 : 5} />
              <Tooltip />
              <Legend wrapperStyle={isMobile ? { fontSize: 10 } : undefined} iconSize={isMobile ? 8 : 14} />
              <Bar dataKey="pedreiro" name="Pedreiro" fill={COLORS[0]} stackId="a" />
              <Bar dataKey="servente" name="Servente" fill={COLORS[1]} stackId="a" />
              <Bar dataKey="carpinteiro" name="Carpinteiro" fill={COLORS[2]} stackId="a" />
              <Bar dataKey="outros" name="Outros" fill={COLORS[3]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top {isMobile ? 5 : 10} Atividades</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart data={atividadesGrafico} layout="vertical" margin={isMobile ? { top: 0, right: 8, left: 0, bottom: 0 } : undefined}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: isMobile ? 9 : 12 }} tickCount={isMobile ? 4 : 5} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={isMobile ? 82 : 120} tick={{ fontSize: isMobile ? 9 : 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill={COLORS[4]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top {isMobile ? 5 : 10} Setores</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <BarChart data={setoresGrafico} layout="vertical" margin={isMobile ? { top: 0, right: 8, left: 0, bottom: 0 } : undefined}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: isMobile ? 9 : 12 }} tickCount={isMobile ? 4 : 5} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={isMobile ? 82 : 120} tick={{ fontSize: isMobile ? 9 : 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill={COLORS[5]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
