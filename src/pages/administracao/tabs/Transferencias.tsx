import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { useTransferencias } from "@/lib/administracao/catalog";

export default function Transferencias() {
  const { userProfile } = useAuth();
  const { currentProject, projects } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const { data: transferencias = [], isLoading } = useTransferencias(organizacaoId, projetoId);

  const nomeObraPorId = useMemo(() => new Map(projects.map((p) => [p.id, p.nome])), [projects]);

  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return transferencias;
    return transferencias.filter((t) => t.nome.toLowerCase().includes(b) || t.matricula.toLowerCase().includes(b));
  }, [transferencias, busca]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-1.5 max-w-sm">
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Nome ou matrícula..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mat.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && filtrados.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>}
              {filtrados.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.matricula}</TableCell>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>{t.cargo_nome ?? "—"}</TableCell>
                  <TableCell>{nomeObraPorId.get(t.projeto_origem_id) ?? "—"}</TableCell>
                  <TableCell>{nomeObraPorId.get(t.projeto_destino_id) ?? "—"}</TableCell>
                  <TableCell>{t.data_transferencia}</TableCell>
                  <TableCell>{t.motivo ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
