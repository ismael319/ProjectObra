import { create } from 'zustand';

// Estado global mínimo, só pra telas densas (ex.: Gantt Livre) pedirem pro
// DashboardLayout esconder a barra lateral de navegação durante apresentações
// — sem precisar prop-drill através do Outlet/roteador.
type State = {
  presentationMode: boolean;
  setPresentationMode: (v: boolean) => void;
};

export const usePresentationMode = create<State>((set) => ({
  presentationMode: false,
  setPresentationMode: (v) => set({ presentationMode: v }),
}));
