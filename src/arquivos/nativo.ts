// Dentro do programa (Electron): diálogos nativos pra abrir/salvar, via a ponte do preload (window.animasyNativo).
// No navegador nada daqui é usado: o salvar.ts cai no File System Access API / download.
interface Ponte {
  abrir(): Promise<string[] | null>;
  salvarComo(nome: string): Promise<string | null>;
  ler(caminho: string): Promise<Uint8Array>;
  escrever(caminho: string, bytes: Uint8Array): Promise<boolean>;
  caminhoDe(arquivo: File): string;
}
const ponte = (): Ponte | undefined => (typeof window !== 'undefined' ? (window as unknown as { animasyNativo?: Ponte }).animasyNativo : undefined);
export const noPrograma = () => !!ponte();

const nomeDe = (c: string) => c.split(/[\\/]/).pop() || c;
const tipoDe = (n: string) => (/\.glb$|\.vrm$/i.test(n) ? 'model/gltf-binary' : '');

/** Imita um FileSystemFileHandle: o resto do app salva "por cima" sem saber se é navegador ou programa. */
export interface HandleNativo extends FileSystemFileHandle { caminho: string }
export function handleDe(caminho: string): HandleNativo {
  const nome = nomeDe(caminho);
  return {
    kind: 'file', name: nome, caminho,
    getFile: async () => new File([await ponte()!.ler(caminho)], nome, { type: tipoDe(nome) }),
    createWritable: async () => {
      const partes: Uint8Array[] = [];
      return {
        write: async (b: ArrayBuffer | Uint8Array) => { partes.push(b instanceof Uint8Array ? b : new Uint8Array(b)); },
        close: async () => {
          const o = new Uint8Array(partes.reduce((a, p) => a + p.length, 0));
          let k = 0;
          for (const p of partes) { o.set(p, k); k += p.length; }
          await ponte()!.escrever(caminho, o);
        },
      };
    },
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    isSameEntry: async (o: unknown) => (o as HandleNativo)?.caminho === caminho,
  } as unknown as HandleNativo;
}
export const ehHandleNativo = (h: unknown): h is HandleNativo => !!h && typeof (h as HandleNativo).caminho === 'string';

export async function escolherNativo(): Promise<{ arquivos: File[]; handle?: FileSystemFileHandle } | null> {
  const cs = await ponte()!.abrir();
  if (!cs || !cs.length) return null;
  const arquivos = await Promise.all(cs.map(async (c) => new File([await ponte()!.ler(c)], nomeDe(c))));
  const i = cs.findIndex((c) => /\.(glb|gltf|vrm|fbx)$/i.test(c));
  return { arquivos, handle: i >= 0 ? handleDe(cs[i]) : undefined };
}

export async function salvarNativo(bytes: ArrayBuffer, nomeSugerido: string): Promise<{ handle: FileSystemFileHandle; modo: 'salvo' } | null> {
  const c = await ponte()!.salvarComo(nomeSugerido);
  if (!c) return null;
  await ponte()!.escrever(c, new Uint8Array(bytes));
  return { handle: handleDe(c), modo: 'salvo' };
}

/** Arrastar arquivo pra janela: o Electron entrega o caminho de cada File. */
export function handleDoArrasto(arquivos: File[]): FileSystemFileHandle | undefined {
  const p = ponte();
  if (!p) return undefined;
  for (const f of arquivos) {
    const c = p.caminhoDe(f);
    if (c && /\.(glb|gltf|vrm|fbx)$/i.test(c)) return handleDe(c);
  }
  return undefined;
}
