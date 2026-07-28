import { CadastroPage } from "./components/CadastroPage";
import { useSetores } from "./lib/catalog";

export default function CadAreas() {
  const { data: setores = [] } = useSetores(false);
  const setorMap = new Map(setores.map((s) => [s.id, s.nome]));
  return (
    <CadastroPage
      title="Áreas"
      description="Áreas dentro de cada setor"
      table="areas"
      fields={[
        { key: "setor_id", label: "Setor", type: "select", required: true,
          options: setores.map((s) => ({ value: s.id, label: s.nome })) },
        { key: "codigo", label: "Código EAP", type: "text" },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
      extraColumns={[{ key: "setor_id", label: "Setor", render: (r) => setorMap.get(r.setor_id) ?? "—" }]}
    />
  );
}
