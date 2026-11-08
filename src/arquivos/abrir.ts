// Abrir modelos: glb/gltf (com .bin e texturas soltos), vrm e fbx. Tudo a partir dos bytes, sem servidor.
import { AnimationClip, LoadingManager, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export interface ArquivoEntrada { nome: string; bytes: ArrayBuffer }

export interface ModeloCarregado {
  root: Object3D;
  clips: AnimationClip[];
  /** nome como está no arquivo (o three tira pontos e espaços: "Hand.L" vira "HandL") */
  nomeOriginal: Map<Object3D, string>;
  /** mapa humanoide que vem pronto no VRM (nome do osso VRM → nome do nó) */
  vrm?: Record<string, string>;
  principal: string;
  formato: 'glb' | 'gltf' | 'fbx';
}

export const EXTENSOES = ['.glb', '.gltf', '.vrm', '.fbx'];
const ext = (n: string) => n.slice(n.lastIndexOf('.')).toLowerCase();
export const ehModelo = (n: string) => EXTENSOES.includes(ext(n));

export async function carregarModelo(arquivos: ArquivoEntrada[]): Promise<ModeloCarregado> {
  const principal = arquivos.find((a) => ehModelo(a.nome));
  if (!principal) throw new Error('Nenhum modelo (.glb, .gltf, .vrm ou .fbx) entre os arquivos.');
  // arquivos de apoio (.bin, texturas) viram endereços temporários pelo nome
  const urls = new Map<string, string>();
  for (const a of arquivos) if (a !== principal) urls.set(a.nome.toLowerCase(), URL.createObjectURL(new Blob([a.bytes])));
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    const base = decodeURIComponent(url.split(/[\\/]/).pop() || '').toLowerCase();
    return urls.get(base) || url;
  });
  try {
    const e = ext(principal.nome);
    if (e === '.fbx') {
      const grupo = new FBXLoader(manager).parse(principal.bytes, '');
      const nomeOriginal = new Map<Object3D, string>();
      grupo.traverse((o) => nomeOriginal.set(o, o.name));
      return { root: grupo, clips: grupo.animations, nomeOriginal, principal: principal.nome, formato: 'fbx' };
    }
    const loader = new GLTFLoader(manager);
    const dados: ArrayBuffer | string = e === '.gltf' ? new TextDecoder().decode(principal.bytes) : principal.bytes;
    const gltf = await loader.parseAsync(dados, '');
    const json = gltf.parser.json;
    const nomeOriginal = new Map<Object3D, string>();
    gltf.scene.traverse((o) => {
      const a = gltf.parser.associations.get(o);
      const nome = a && a.nodes !== undefined ? json.nodes[a.nodes].name : undefined;
      nomeOriginal.set(o, nome ?? o.name);
    });
    return { root: gltf.scene, clips: gltf.animations, nomeOriginal, vrm: lerVRM(json), principal: principal.nome, formato: e === '.gltf' ? 'gltf' : 'glb' };
  } finally {
    setTimeout(() => { for (const u of urls.values()) URL.revokeObjectURL(u); }, 10000);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lerVRM(json: any): Record<string, string> | undefined {
  const nome = (i: number) => json.nodes?.[i]?.name as string | undefined;
  const r: Record<string, string> = {};
  const v1 = json.extensions?.VRMC_vrm?.humanoid?.humanBones;
  if (v1) for (const [k, v] of Object.entries(v1)) { const n = nome((v as { node: number }).node); if (n) r[k] = n; }
  const v0 = json.extensions?.VRM?.humanoid?.humanBones;
  if (Array.isArray(v0)) for (const b of v0) { const n = nome(b.node); if (n) r[b.bone] = n; }
  return Object.keys(r).length ? r : undefined;
}
