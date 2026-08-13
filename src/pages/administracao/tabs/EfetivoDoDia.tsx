import { useState } from "react";
import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { useEfetivoDoDia } from "@/lib/administracao/catalog";
import { todayISO } from "@/pages/apontamento/lib/date-utils";

function Delta({ cadastro, campo }: { cadastro: number; campo: number | null }) {
  if (campo === null) return <span className="text-muted-foreground">—</span>;
  const diff = campo - cadastro;
  if (diff === 0) return <span className="text-green-600 dark:text-green-400 font-medium">0</span>;
  const cor = Math.abs(diff) >= 2 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return <span className={`font-medium ${cor}`}>{diff > 0 ? `+${diff}` : diff}</span>;
}

export default function EfetivoDoDia() {
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const [data, setData] = useState(todayISO());

  const { data: linhas = [], isLoading } = useEfetivoDoDia(organizacaoId, projetoId, data);

  const totais = linhas.reduce(
    (acc, l) => ({
      cadastro: acc.cadastro + l.cadastro,
      ponto: l.ponto === null ? acc.ponto : (acc.ponto ?? 0) + l.ponto,
      campo: l.campo === null ? acc.campo : (acc.campo ?? 0) + l.campo,
    }),
    { cadastro: 0, ponto: null as number | null, campo: null as number | null }
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Label>Data de referência</Label>
              <input
                type="date"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setData(todayISO())}>Hoje</Button>
              <Link to="/dashboard/administracao/importar-ponto">
                <Button variant="outline"><Upload size={16} /> Importar Ponto</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Efetivo por setor</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cadastro (total registrado) × Ponto (importado do Secullum) × Campo (Apontamento de Mão de Obra).
            "—" quando não há importação de Ponto ou apontamento de Campo pra essa data.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Cadastro</TableHead>
                  <TableHead className="text-right">Ponto</TableHead>
                  <TableHead className="text-right">Campo</TableHead>
                  <TableHead className="text-right">Delta (Campo − Cadastro)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && linhas.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum setor cadastrado ainda.</TableCell></TableRow>}
                {linhas.map((l) => (
                  <TableRow key={l.setorId}>
                    <TableCell className="font-medium">{l.setorNome}</TableCell>
                    <TableCell className="text-right">{l.cadastro}</TableCell>
                    <TableCell className="text-right">{l.ponto ?? "—"}</TableCell>
                    <TableCell className="text-right">{l.campo ?? "—"}</TableCell>
                    <TableCell className="text-right"><Delta cadastro={l.cadastro} campo={l.campo} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {linhas.length > 0 && (
                <TableBody>
                  <TableRow className="font-semibold bg-muted/40">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totais.cadastro}</TableCell>
                    <TableCell className="text-right">{totais.ponto ?? "—"}</TableCell>
                    <TableCell className="text-right">{totais.campo ?? "—"}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
