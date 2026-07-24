import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, type Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const rdrApp = initializeApp(firebaseConfig, "rdr-bdr");
const rdrDb = getFirestore(rdrApp);

export const RDR_CATEGORIAS = ["Ferramentas", "Comportamental", "Documentos", "EPI", "Equipamentos", "5S", "Sinalização", "Reconhecimento"];

export interface RdrRecord {
  id: string;
  dataOcorrido?: string;
  hora?: string;
  autorId?: string;
  autorNome?: string;
  local?: string;
  categorias?: string[];
  concluido?: "SIM" | "NÃO" | string;
  nomeColaborador?: string;
  responsavelSetor?: string;
  responsavelRegistro?: string;
  descricao?: string;
  sugestaoCorrecao?: string;
  savedAt?: Timestamp;
}

export function subscribeRdrRecords(callback: (records: RdrRecord[]) => void): () => void {
  return onSnapshot(collection(rdrDb, "records"), (snapshot) => {
    const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RdrRecord);
    records.sort((a, b) => (b.savedAt?.seconds ?? 0) - (a.savedAt?.seconds ?? 0));
    callback(records);
  });
}
