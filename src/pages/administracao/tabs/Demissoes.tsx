import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useDemissoes } from "@/lib/administracao/catalog";
import type { MotivoDemissao } from "@/lib/administracao/db";

const MOTIVO_LABEL: Record<MotivoDemissao, string> = {
  pedido_demissao: "Pedido de demissão",
  justa_causa: "Justa causa",
  termino_contrato: "Término de contrato",
  sem_justa_causa: "Sem justa causa",
};

export default function Demissoes() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const { data: demissoes = [], isLoading } = useDemissoes(organizacaoId);

  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState<MotivoDemissao | null>(null);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return demissoes.filter((d) => {
      if (b && !d.nome.toLowerCase().includes(b) && !d.matricula.toLowerCase().includes(b)) return false;
      if (motivo && d.motivo !== motivo) return false;
      return true;
    });
  }, [demissoes, busca, motivo]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nome ou matrícula..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Combobox
              options={(Object.keys(MOTIVO_LABEL) as MotivoDemissao[]).map((m) => ({ value: m, label: MOTIVO_LABEL[m] }))}
              value={motivo}
              onChange={(v) => setMotivo(v as MotivoDemissao | null)}
              placeholder="Todos"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mat.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead>Demissão</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && filtrados.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>}
              {filtrados.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.matricula}</TableCell>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell>{d.cargo_nome ?? "—"}</TableCell>
                  <TableCell>{d.data_admissao ?? "—"}</TableCell>
                  <TableCell>{d.data_demissao}</TableCell>
                  <TableCell>{d.local ?? "—"}</TableCell>
                  <TableCell>{MOTIVO_LABEL[d.motivo]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
