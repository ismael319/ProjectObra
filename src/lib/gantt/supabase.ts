import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Scenario = {
  id: string;
  name: string;
  created_at?: string;
};

export type FuncaoRow = {
  quantidade: number;
  tipo: string;
  subtipo: string;
  local: string;
};

export type EquipamentoRow = {
  quantidade: number;
  descricao: string;
};

export type Equipe = {
  id: string;
  scenario_id: string;
  nome: string;
  cor: string;
  funcoes: FuncaoRow[];
  equipamentos: EquipamentoRow[];
  funcao: string;
  quantidade_funcionarios: number;
};

export type Dependencia = {
  id: string;
  lag: number;
};

export type Atividade = {
  id: string;
  scenario_id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  equipes_alocadas: string[];
  cor: string;
  ordem: number;
  predecessoras: Dependencia[];
};

export type Parada = {
  id: string;
  scenario_id: string;
  data: string;
};
