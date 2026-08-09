import { useMemo } from "react";
import { AlertTriangle, Users, UserCheck, FileWarning } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useAuth } from "@/lib/auth-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { useFuncionarios, useRhCargos, useRhSetores, useRhGrupos, useAlertasDocumentos } from "@/lib/administracao/catalog";
import { funcaoBase } from "@/lib/administracao/cargo-nivel";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];
const LOCAL_LABEL: Record<string, string> = {
  obra: "Obra", alojamento: "Alojamento", em_viagem: "Em viagem", turno_noite: "Turno à noite",
};

function contar<T>(itens: T[], chave: (item: T) => string): { nome: string; total: number }[] {
  const map = new Map<string, number>();
  for (const item of itens) {
    const k = chave(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
}

function diasDesde(dataISO: string): number {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const data = new Date(`${dataISO}T00:00:00Z`);
  return Math.round((hoje.getTime() - data.getTime()) / 86_400_000);
}

function truncarLabel(valor: string, limite: number): string {
  return valor.length > limite ? `${valor.slice(0, limite - 1)}…` : valor;
}

export default function DashboardGeral() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const isMobile = useMediaQuery("(max-width: 639px)");

  const { data: funcionariosTodos = [], isLoading } = useFuncionarios(organizacaoId);
  const { data: cargos = [] } = useRhCargos(organizacaoId);
  const { data: setores = [] } = useRhSetores(organizacaoId);
  const { data: grupos = [] } = useRhGrupos(organizacaoId);
  const { data: alertasDocumentos = [] } = useAlertasDocumentos(organizacaoId);

  // Dashboard é sobre o efetivo atual — desligados não entram nas contagens.
  const funcionarios = useMemo(() => funcionariosTodos.filter((f) => f.ativo), [funcionariosTodos]);

  const cargoNomePorId = useMemo(() => new Map(cargos.map((c) => [c.id, c.nome])), [cargos]);
  const setorNomePorId = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);
  const grupoNomePorId = useMemo(() => new Map(grupos.map((g) => [g.id, g.nome])), [grupos]);

  const resumo = useMemo(() => {
    const direta = funcionarios.filter((f) => f.categoria === "D").length;
    const indireta = funcionarios.filter((f) => f.categoria === "I").length;
    const admitidos30d = funcionarios.filter((f) => diasDesde(f.data_admissao) <= 30 && diasDesde(f.data_admissao) >= 0).length;
    const semCargo = funcionarios.filter((f) => !f.cargo_id).length;
    const semSetor = funcionarios.filter((f) => !f.setor_id).length;
    return { total: funcionarios.length, direta, indireta, admitidos30d, semCargo, semSetor };
  }, [funcionarios]);

  const porFuncao = useMemo(
    () => contar(funcionarios, (f) => (f.cargo_id ? funcaoBase(cargoNomePorId.get(f.cargo_id) ?? "Sem cargo") : "Sem cargo")).slice(0, 15),
    [funcionarios, cargoNomePorId]
  );

  const porSetor = useMemo(
    () => contar(funcionarios, (f) => (f.setor_id ? setorNomePorId.get(f.setor_id) ?? "Sem setor" : "Sem setor")),
    [funcionarios, setorNomePorId]
  );

  const porGrupo = useMemo(
    () => contar(funcionarios, (f) => (f.grupo_id ? grupoNomePorId.get(f.grupo_id) ?? "Sem grupo" : "Sem grupo")),
    [funcionarios, grupoNomePorId]
  );

  const porLocal = useMemo(
    () => contar(funcionarios, (f) => (f.local ? LOCAL_LABEL[f.local] : "Não informado")),
    [funcionarios]
  );

  const funcoesNoGrafico = isMobile ? porFuncao.slice(0, 6) : porFuncao;
  const setoresNoGrafico = isMobile ? porSetor.slice(0, 6) : porSetor;
  const gruposNoGrafico = isMobile ? porGrupo.slice(0, 6) : porGrupo;

  const documentosVencidos = alertasDocumentos.filter((a) => a.diasParaVencer < 0).length;
  const documentosVencendo = alertasDocumentos.length - documentosVencidos;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="p-3 sm:p-6"><div className="text-xs text-muted-foreground sm:text-sm">Total ativos</div><div className="mt-1 text-2xl font-bold sm:text-3xl">{resumo.total}</div></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-6"><div className="text-xs text-muted-foreground sm:text-sm">Direta (MOD)</div><div className="mt-1 text-2xl font-bold sm:text-3xl">{resumo.direta}</div></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-6"><div className="text-xs text-muted-foreground sm:text-sm">Indireta (MOI)</div><div className="mt-1 text-2xl font-bold sm:text-3xl">{resumo.indireta}</div></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-6"><div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm"><UserCheck size={14} /> Admitidos (30d)</div><div className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{resumo.admitidos30d}</div></CardContent></Card>
        <Card className={`col-span-2 sm:col-span-1 ${documentosVencidos > 0 ? "border-red-300 dark:border-red-800" : ""}`}>
          <CardContent className="p-3 sm:p-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1.5"><FileWarning size={14} /> Documentos pendentes</div>
            <div className="mt-1 text-2xl font-bold text-red-600 sm:text-3xl">{alertasDocumentos.length}</div>
            {alertasDocumentos.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{documentosVencidos} vencido(s) · {documentosVencendo} vencendo em 30d</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(resumo.semCargo > 0 || resumo.semSetor > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {resumo.semCargo > 0 && `${resumo.semCargo} funcionário(s) sem Cargo`}
            {resumo.semCargo > 0 && resumo.semSetor > 0 && " · "}
            {resumo.semSetor > 0 && `${resumo.semSetor} funcionário(s) sem Setor`}
            {" "}— complete o cadastro pra esses dados aparecerem certinho nos gráficos.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-start gap-2 text-base"><Users size={16} className="mt-0.5 shrink-0" /> Por Função (agrupada por nível){isMobile && porFuncao.length > 6 ? " — Top 6" : ""}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 230 : Math.max(300, porFuncao.length * 28)}>
              <BarChart data={funcoesNoGrafico} layout="vertical" margin={{ left: isMobile ? 0 : 24, right: isMobile ? 8 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={isMobile ? 78 : 180} tick={{ fontSize: isMobile ? 10 : 11 }} tickFormatter={(valor: string) => isMobile ? truncarLabel(valor, 12) : valor} />
                <Tooltip />
                <Bar dataKey="total" name="Funcionários" fill="#2563eb" radius={[0, 4, 4, 0]}>
                  {funcoesNoGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Setor{isMobile && porSetor.length > 6 ? " — Top 6" : ""}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 230 : Math.max(300, porSetor.length * 32)}>
              <BarChart data={setoresNoGrafico} layout="vertical" margin={{ left: isMobile ? 0 : 24, right: isMobile ? 8 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={isMobile ? 78 : 140} tick={{ fontSize: isMobile ? 10 : 12 }} tickFormatter={(valor: string) => isMobile ? truncarLabel(valor, 12) : valor} />
                <Tooltip />
                <Bar dataKey="total" name="Funcionários" fill="#16a34a" radius={[0, 4, 4, 0]}>
                  {setoresNoGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Local</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
              <PieChart>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Pie data={porLocal} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={isMobile ? 72 : 90} label={isMobile ? false : (entry: any) => `${entry.nome}: ${entry.total}`} labelLine={!isMobile}>
                  {porLocal.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por Grupo{isMobile && porGrupo.length > 6 ? " — Top 6" : ""}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 230 : Math.max(280, porGrupo.length * 30)}>
              <BarChart data={gruposNoGrafico} layout="vertical" margin={{ left: isMobile ? 0 : 24, right: isMobile ? 8 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={isMobile ? 78 : 160} tick={{ fontSize: isMobile ? 10 : 11 }} tickFormatter={(valor: string) => isMobile ? truncarLabel(valor, 12) : valor} />
                <Tooltip />
                <Bar dataKey="total" name="Funcionários" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  {gruposNoGrafico.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
