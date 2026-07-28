import { CadastroPage } from "./components/CadastroPage";
import { useAreas, useSetores } from "./lib/catalog";

export default function CadSubareas() {
  const { data: setores = [] } = useSetores(false);
  const { data: areas = [] } = useAreas(null, false);
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const setorMap = new Map(setores.map((s) => [s.id, s.nome]));
  const areaOpts = areas.map((a) => ({
    value: a.id,
    label: a.nome,
    group: setorMap.get(a.setor_id) ?? "Sem setor",
  }));
  return (
    <CadastroPage
      title="Etapas"
      description="Detalhamento dentro de cada área"
      table="subareas"
      fields={[
        { key: "area_id", label: "Área (setor)", type: "select", required: true, options: areaOpts },
        { key: "codigo", label: "Código EAP", type: "text" },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
      extraColumns={[
        { key: "area_id", label: "Setor / Área", render: (r) => {
          const a = areaMap.get(r.area_id);
          if (!a) return "—";
          return `${setorMap.get(a.setor_id) ?? "?"} / ${a.nome}`;
        } },
      ]}
    />
  );
}
