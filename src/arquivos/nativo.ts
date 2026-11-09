// Dentro do programa (Tauri): diálogos nativos do Windows pra abrir/salvar e arrastar arquivo pra janela.
// No navegador nada daqui é usado: o salvar.ts cai no File System Access API / download.
import { open as abrirDlg, save as salvarDlg } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export const noPrograma = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const nomeDe = (c: string) => c.split(/[\\/]/).pop() || c;
const tipoDe = (n: string) => (/\.glb$|\.vrm$/i.test(n) ? 'model/gltf-binary' : '');

/** Imita um FileSystemFileHandle: o resto do app salva "por cima" sem saber se é navegador ou programa. */
export interface HandleNativo extends FileSystemFileHandle { caminho: string }
export function handleDe(caminho: string): HandleNativo {
  const nome = nomeDe(caminho);
  return {
    kind: 'file', name: nome, caminho,
    getFile: async () => new File([new Uint8Array(await readFile(caminho))], nome, { type: tipoDe(nome) }),
    createWritable: async () => {
      const partes: Uint8Array[] = [];
      return {
        write: async (b: ArrayBuffer | Uint8Array) => { partes.push(b instanceof Uint8Array ? b : new Uint8Array(b)); },
        close: async () => {
          const n = partes.reduce((a, p) => a + p.length, 0);
          const o = new Uint8Array(n);
          let k = 0;
          for (const p of partes) { o.set(p, k); k += p.length; }
          await writeFile(caminho, o);
        },
      };
    },
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    isSameEntry: async (o: unknown) => (o as HandleNativo)?.caminho === caminho,
  } as unknown as HandleNativo;
}
export const ehHandleNativo = (h: unknown): h is HandleNativo => !!h && typeof (h as HandleNativo).caminho === 'string';

async function lerCaminhos(cs: string[]): Promise<{ arquivos: File[]; handle?: FileSystemFileHandle }> {
  const arquivos = await Promise.all(cs.map(async (c) => new File([new Uint8Array(await readFile(c))], nomeDe(c))));
  const i = cs.findIndex((c) => /\.(glb|gltf|vrm|fbx)$/i.test(c));
  return { arquivos, handle: i >= 0 ? handleDe(cs[i]) : undefined };
}

export async function escolherNativo(): Promise<{ arquivos: File[]; handle?: FileSystemFileHandle } | null> {
  const r = await abrirDlg({
    multiple: true,
    filters: [
      { name: 'Modelo 3D', extensions: ['glb', 'gltf', 'vrm', 'fbx'] },
      { name: 'Arquivos de apoio (.bin, texturas)', extensions: ['bin', 'png', 'jpg', 'jpeg', 'webp'] },
    ],
  });
  if (!r) return null;
  return lerCaminhos(Array.isArray(r) ? r : [r]);
}

export async function salvarNativo(bytes: ArrayBuffer, nomeSugerido: string): Promise<{ handle: FileSystemFileHandle; modo: 'salvo' } | null> {
  const c = await salvarDlg({ defaultPath: nomeSugerido, filters: [{ name: 'glTF binário', extensions: ['glb'] }] });
  if (!c) return null;
  await writeFile(c, new Uint8Array(bytes));
  return { handle: handleDe(c), modo: 'salvo' };
}

/** Arrastar arquivo do Explorer pra janela. */
export function ouvirArrasto(aoSoltar: (r: { arquivos: File[]; handle?: FileSystemFileHandle }) => void, aoMudar: (sobre: boolean) => void) {
  getCurrentWebview().onDragDropEvent(async (e) => {
    const t = e.payload.type;
    if (t === 'enter' || t === 'over') aoMudar(true);
    else if (t === 'leave') aoMudar(false);
    else if (t === 'drop') { aoMudar(false); if (e.payload.paths.length) aoSoltar(await lerCaminhos(e.payload.paths)); }
  });
}
