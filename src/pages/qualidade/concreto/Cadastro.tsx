import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CadFornecedores from "./CadFornecedores";
import CadTracos from "./CadTracos";
import CadEtapas from "./CadEtapas";

const TABS = [
  { value: "fornecedores", label: "Fornecedores", Component: CadFornecedores },
  { value: "tracos", label: "Traços", Component: CadTracos },
  { value: "etapas", label: "Etapas", Component: CadEtapas },
];

export default function CadastroConcretoPage() {
  return (
    <Tabs defaultValue="fornecedores" className="space-y-4">
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
