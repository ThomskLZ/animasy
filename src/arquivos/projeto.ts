// Projeto guardado no próprio navegador (IndexedDB): o modelo original, as animações criadas, os ajustes ainda
// não salvos, a lixeira e o mapa do corpo. Fecha a aba e volta: está tudo lá. Nada vai pra internet.
import type { AjustesClip } from '../nucleo/ajustes';
import type { Camada } from '../nucleo/camadas';
import type { MapaCorpo } from '../nucleo/mapaCorpo';
import type { PoseChave } from '../nucleo/poses';
import type { ArquivoEntrada } from './abrir';

export interface AnimSalva {
  id: string;
  nome: string;
  origem?: number;       // índice do clipe no arquivo original (sem mudança na curva)
  clipe?: unknown;       // AnimationClip.toJSON (criada/duplicada aqui)
  ajustes?: AjustesClip;  // projetos antigos (uma camada só)
  camadas?: Camada[];
  ativa?: number;
  fps?: number;
  poses?: PoseChave[];
  nova?: boolean;
  excluidaEm?: number;
}

export interface PoseGuardada { id: string; nome: string; img: string; ossos: Record<string, number[]> }
export interface AcessorioSalvo {
  id: string; encaixe: string; arquivo: string; bytes: ArrayBuffer;
  pos: number[]; rot: number[]; escala: number; exportar: boolean; visivel: boolean;
}

export interface ProjetoSalvo {
  chave: string;
  nome: string;
  arquivos: ArquivoEntrada[];
  anims: AnimSalva[];
  lixeira: AnimSalva[];
  mapa: MapaCorpo;           // só o que a pessoa associou à mão
  handle?: FileSystemFileHandle;
  sujo: boolean;
  atual?: string;
  atualizado: number;
  biblioteca?: PoseGuardada[];
  acessorios?: AcessorioSalvo[];
  encaixesVistos?: boolean;
}

export interface Backup { id?: number; chave: string; nome: string; bytes: ArrayBuffer; quando: number }

let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbP ||= new Promise((ok, err) => {
    const r = indexedDB.open('animasy', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('projetos', { keyPath: 'chave' });
      r.result.createObjectStore('backups', { keyPath: 'id', autoIncrement: true }).createIndex('chave', 'chave');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
  return dbP;
}
function req<T>(store: string, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then((d) => new Promise<T>((ok, err) => {
    const r = f(d.transaction(store, modo).objectStore(store));
    r.onsuccess = () => ok(r.result as T);
    r.onerror = () => err(r.error);
  }));
}

export const guardarProjeto = (p: ProjetoSalvo) => req<void>('projetos', 'readwrite', (s) => s.put(p)).catch(() => undefined);
export const lerProjeto = (chave: string) => req<ProjetoSalvo | undefined>('projetos', 'readonly', (s) => s.get(chave)).catch(() => undefined);
export async function ultimoProjeto(): Promise<ProjetoSalvo | undefined> {
  try {
    const todos = await req<ProjetoSalvo[]>('projetos', 'readonly', (s) => s.getAll());
    return todos.sort((a, b) => b.atualizado - a.atualizado)[0];
  } catch { return undefined; }
}

const MAX_BACKUPS = 5;
export async function guardarBackup(b: Backup) {
  try {
    await req('backups', 'readwrite', (s) => s.add(b));
    const lista = await backups(b.chave);
    for (const velho of lista.slice(MAX_BACKUPS)) await req('backups', 'readwrite', (s) => s.delete(velho.id!));
  } catch { /* sem espaço: segue sem backup */ }
}
export async function backups(chave: string): Promise<Backup[]> {
  try {
    const l = await req<Backup[]>('backups', 'readonly', (s) => s.index('chave').getAll(chave));
    return l.sort((a, b) => b.quando - a.quando);
  } catch { return []; }
}
export const apagarBackup = (id: number) => req<void>('backups', 'readwrite', (s) => s.delete(id)).catch(() => undefined);
