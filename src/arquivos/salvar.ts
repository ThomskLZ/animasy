// Salvar: exporta .glb (GLTFExporter) com os nomes originais dos nós, e grava pelo navegador
// (File System Access API quando tem; senão baixa o arquivo).
import { AnimationClip, Object3D, PropertyBinding } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { escolherNativo, noPrograma, salvarNativo } from './nativo';

/** Exporta o modelo com as animações. O modelo precisa estar na pose de repouso (o exportador grava a pose atual). */
export async function exportarGlb(root: Object3D, clips: AnimationClip[], nomeOriginal: Map<Object3D, string>): Promise<ArrayBuffer> {
  // As trilhas apontam pro nó pelo uuid: assim dá pra pôr de volta os nomes originais (com ponto, espaço...)
  const porUuid = clips.map((c) => new AnimationClip(c.name, c.duration, c.tracks.map((t) => {
    const nome = PropertyBinding.parseTrackName(t.name).nodeName;
    const no = PropertyBinding.findNode(root, nome) as Object3D | undefined;
    const n = t.clone();
    if (no && t.name.startsWith(nome)) n.name = no.uuid + t.name.slice(nome.length);
    return n;
  })));
  const antes = new Map<Object3D, string>();
  root.traverse((o) => {
    const orig = nomeOriginal.get(o);
    if (orig !== undefined && orig !== o.name) { antes.set(o, o.name); o.name = orig; }
  });
  try {
    const r = await new GLTFExporter().parseAsync(root, { binary: true, animations: porUuid, onlyVisible: false });
    if (!(r instanceof ArrayBuffer)) throw new Error('o exportador não devolveu um .glb');
    return r;
  } finally {
    for (const [o, n] of antes) o.name = n;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = window as any;
export const temAcessoArquivos = () => noPrograma() || typeof W.showOpenFilePicker === 'function';
const TIPOS = [{ description: 'Modelo 3D', accept: { 'model/gltf-binary': ['.glb', '.vrm'], 'model/gltf+json': ['.gltf'], 'application/octet-stream': ['.fbx', '.bin', '.png', '.jpg', '.jpeg', '.webp'] } }];

/** Escolher arquivos pra abrir (com handle, pra poder salvar por cima depois). */
export async function escolherParaAbrir(): Promise<{ arquivos: File[]; handle?: FileSystemFileHandle } | null> {
  if (noPrograma()) return escolherNativo();
  if (temAcessoArquivos()) {
    try {
      const hs: FileSystemFileHandle[] = await W.showOpenFilePicker({ multiple: true, types: TIPOS, excludeAcceptAllOption: false });
      const arquivos = await Promise.all(hs.map((h) => h.getFile()));
      const i = arquivos.findIndex((a) => /\.(glb|gltf|vrm|fbx)$/i.test(a.name));
      return { arquivos, handle: i >= 0 ? hs[i] : undefined };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((ok) => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: '.glb,.gltf,.vrm,.fbx,.bin,.png,.jpg,.jpeg,.webp' });
    inp.onchange = () => ok(inp.files && inp.files.length ? { arquivos: [...inp.files] } : null);
    inp.click();
  });
}

export async function podeGravar(h: FileSystemFileHandle): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hh = h as any;
  if (typeof hh.queryPermission !== 'function') return true;
  if ((await hh.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await hh.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function gravarNoHandle(h: FileSystemFileHandle, bytes: ArrayBuffer) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = await (h as any).createWritable();
  await w.write(bytes);
  await w.close();
}

/** "Salvar como": pede o lugar; sem a API, baixa. Devolve o handle novo (ou null se baixou / cancelou). */
export async function salvarComo(bytes: ArrayBuffer, nomeSugerido: string): Promise<{ handle?: FileSystemFileHandle; modo: 'salvo' | 'baixado' } | null> {
  if (noPrograma()) return salvarNativo(bytes, nomeSugerido);
  if (typeof W.showSaveFilePicker === 'function') {
    try {
      const h: FileSystemFileHandle = await W.showSaveFilePicker({ suggestedName: nomeSugerido, types: [{ description: 'glTF binário', accept: { 'model/gltf-binary': ['.glb'] } }] });
      await gravarNoHandle(h, bytes);
      return { handle: h, modo: 'salvo' };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  baixar(bytes, nomeSugerido);
  return { modo: 'baixado' };
}

export function baixar(bytes: ArrayBuffer, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
