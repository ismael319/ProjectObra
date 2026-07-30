import { useMemo, useState } from "react";
import { AlertTriangle, FileCheck2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useFuncionarios, useRhCargos } from "@/lib/administracao/catalog";
import type { FuncionarioRow } from "@/lib/administracao/db";
import { useAlertasDocumentos } from "@/lib/administracao/catalog";
import { VencimentoPill } from "../status-pills";
import DocumentosFuncionarioModal from "./DocumentosFuncionarioModal";

export default function Documentacao() {
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const { data: funcionariosTodos = [] } = useFuncionarios(organizacaoId);
  const { data: cargos = [] } = useRhCargos(organizacaoId);
  const { data: alertas = [], isLoading: carregandoAlertas } = useAlertasDocumentos(organizacaoId);

  const [busca, setBusca] = useState("");
  const [verDocumentos, setVerDocumentos] = useState<FuncionarioRow | null>(null);

  const cargoNomePorId = useMemo(() => new Map(cargos.map((c) => [c.id, c.nome])), [cargos]);

  // Não faz sentido cobrar renovação de ASO de quem já foi desligado.
  const funcionarios = useMemo(() => funcionariosTodos.filter((f) => f.ativo), [funcionariosTodos]);

  const pendenciasPorFuncionario = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of alertas) map.set(a.funcionarioId, (map.get(a.funcionarioId) ?? 0) + 1);
    return map;
  }, [alertas]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return funcionarios;
    return funcionarios.filter((f) => f.nome.toLowerCase().includes(b) || f.matricula.toLowerCase().includes(b));
  }, [funcionarios, busca]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" /> Alertas de vencimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoAlertas ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento vencido ou vencendo nos próximos 30 dias.</p>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 rounded px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.funcionarioNome}</p>
                    <p className="text-xs text-muted-foreground">{a.tipoDocumentoNome}</p>
                  </div>
                  <VencimentoPill diasParaVencer={a.diasParaVencer} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 size={16} /> Documentação por funcionário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou matrícula..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mat.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Pendências</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado</TableCell></TableRow>
                )}
                {filtrados.map((f) => {
                  const pendencias = pendenciasPorFuncionario.get(f.id) ?? 0;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.matricula}</TableCell>
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell>{f.cargo_id ? cargoNomePorId.get(f.cargo_id) ?? "—" : "—"}</TableCell>
                      <TableCell>
                        {pendencias > 0 ? (
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{pendencias} vencido(s)/vencendo</span>
                        ) : (
                          <span className="text-xs text-green-600 dark:text-green-400">Em dia</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setVerDocumentos(f)}>Ver documentos</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {verDocumentos && organizacaoId && (
        <DocumentosFuncionarioModal
          organizacaoId={organizacaoId}
          userId={user?.id}
          funcionario={verDocumentos}
          onClose={() => setVerDocumentos(null)}
        />
      )}
    </div>
  );
}
