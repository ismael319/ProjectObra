import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadEmpresas from "./CadEmpresas";
import CadLiderancas from "./CadLiderancas";
import CadSetores from "./CadSetores";
import CadAreas from "./CadAreas";
import CadSubareas from "./CadSubareas";
import CadAtividades from "./CadAtividades";

const TABS = [
  { value: "empresas", label: "Empresas", Component: CadEmpresas },
  { value: "liderancas", label: "Lideranças", Component: CadLiderancas },
  { value: "setores", label: "Setores", Component: CadSetores },
  { value: "areas", label: "Áreas", Component: CadAreas },
  { value: "subareas", label: "Etapas", Component: CadSubareas },
  { value: "atividades", label: "Atividades", Component: CadAtividades },
];

export default function CadastroPage() {
  return (
    <Tabs defaultValue="empresas" className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <t.Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
