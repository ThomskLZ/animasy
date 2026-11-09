// Animasy: ver e ajustar animações de qualquer personagem riggado, direto no navegador.
import './estilo.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  AjusteOsso, AjustesClip, ChaveEmEdicao, ChavePos, ChaveRot, chavesPorQuadro, definirInterp, escreverChave, Escopo, evalPos, evalRot,
  interpNoQuadro, moverChave, NOME_INTERP, pArr, pesoEscopo, prepararChave, qArr, remapearChaves, tirarChave,
} from './nucleo/ajustes';
import { apontar, curvarCadeia, ehAncestral, moverMeio, resolverIK } from './nucleo/ik';
import { cadeiaIK, MapaCorpo, mapaAutomatico, nomeSlot, OssoInfo, Slot, SLOTS } from './nucleo/mapaCorpo';
import { assarClip, clipeParado, compararClipes, MapaRepouso, valorAjustado } from './nucleo/assar';
import { Camada, CamadaAjuste, CamadaExagero, deltaCamadas, limparCamadas, novaCamada, ossosDaCamada, ossosMexidos, resolverCamada, temAjuste } from './nucleo/camadas';
import { anguloQuat, esquecerClipe, trilha, valorOriginal } from './nucleo/clipe';
import { mapaRot, mapaVet, paresEspelho } from './nucleo/espelho';
import { atualizarTrilhas, detectarPoses, gerarClipePoses, PoseChave } from './nucleo/poses';
import { remapaTrecho, retimeClip } from './nucleo/tempo';
import { acharEncaixes, Encaixe } from './nucleo/encaixes';
import { LadoRetarget, retargetar } from './nucleo/retarget';
import { ArquivoEntrada, carregarModelo, ehModelo, ModeloCarregado } from './arquivos/abrir';
import { baixar, escolherParaAbrir, exportarGlb, gravarNoHandle, podeGravar, salvarComo, temAcessoArquivos } from './arquivos/salvar';
import {
  AcessorioSalvo, AnimSalva, apagarBackup, backups, guardarBackup, guardarProjeto, lerProjeto, PoseGuardada, ProjetoSalvo, ultimoProjeto,
} from './arquivos/projeto';
import { abrirDialogo, avisar, confirmar, esc } from './interface/dialogo';
import { aplicarIcones, ICONES } from './interface/icones';
import { LinhaTempo } from './interface/linhaTempo';
import { PainelChaves } from './interface/painelChaves';
import { desenharSilhueta } from './interface/silhueta';
import { Arvore } from './interface/arvore';
import { CampoNumero } from './interface/campoNumero';
import { aplicarTema, cor, lerConfig, NomeTema, salvarConfig, TEMAS } from './interface/tema';
import roboUrl from './exemplos/robo.glb?url';
import { noPrograma, ouvirArrasto } from './arquivos/nativo';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const _v = () => new THREE.Vector3();
const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const RAD = Math.PI / 180;
aplicarIcones();

// ---------------------------------------------------------------- configurações e tema
const cfg = lerConfig();
aplicarTema(cfg.tema);
document.body.classList.toggle('avancado', cfg.avancado);
let corJ = { normal: 0x83a598, sel: 0xfabd2f, ed: 0xfe8019, aj: 0xfe8019 };

// ---------------------------------------------------------------- cena
const canvas = $<HTMLCanvasElement>('tela');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
let mexeuNaCamera = false;
controls.addEventListener('start', () => { mexeuNaCamera = true; });
let ALTURA = 1.7, CENTRO = new THREE.Vector3(0, 0.85, 0), vistaAtual = 'tres';
const VISTAS: Record<string, [number, number, number]> = { frente: [0, 0.12, 1], lado: [1, 0.12, 0], tres: [0.62, 0.32, 0.8],
  costas: [0, 0.18, -1], cima: [0, 1, 0.12], perto: [0.45, 0.15, 1] };
function enquadrar(nome = vistaAtual) {
  vistaAtual = nome;
  const perto = nome === 'perto';
  const alvo = perto ? new THREE.Vector3(CENTRO.x, CENTRO.y + ALTURA * 0.3, CENTRO.z) : CENTRO.clone();
  const visivel = perto ? ALTURA * 0.9 : ALTURA * 2.0;
  let dist = (visivel / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  if (camera.aspect < 1) dist /= camera.aspect;
  const dir = new THREE.Vector3(...VISTAS[nome]).normalize();
  if (M) dir.applyQuaternion(M.root.getWorldQuaternion(new THREE.Quaternion()));
  camera.position.copy(alvo).add(dir.multiplyScalar(dist));
  controls.target.copy(alvo);
  controls.update();
  mexeuNaCamera = false;
}
function zoom(sentido: number) {
  const d = camera.position.clone().sub(controls.target);
  const nd = THREE.MathUtils.clamp(d.length() * (sentido > 0 ? 0.8 : 1.25), controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(d.setLength(nd));
  mexeuNaCamera = true;
}
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x55606f, 1.1);
scene.add(hemi);
const sol = new THREE.DirectionalLight(0xfff1dc, 2.2);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
scene.add(sol, sol.target);
const cc = document.createElement('canvas');
cc.width = cc.height = 128;
const texChao = new THREE.CanvasTexture(cc);
texChao.wrapS = texChao.wrapT = THREE.RepeatWrapping;
texChao.magFilter = THREE.NearestFilter;
texChao.colorSpace = THREE.SRGBColorSpace;
const chao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: texChao }));
chao.rotation.x = -Math.PI / 2;
chao.receiveShadow = true;
scene.add(chao);
let CASA = 0.5;
const grad = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 255, 255, 255, 255]), 2, 1);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;
const helper = new THREE.Group();     // troca a cada modelo (SkeletonHelper)
scene.add(helper);
function coresDaCena() {
  scene.background = new THREE.Color(cor('cena'));
  const cx = cc.getContext('2d')!;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? cor('chao1') : cor('chao2'); cx.fillRect(i * 64, j * 64, 64, 64); }
  texChao.needsUpdate = true;
  const n = (k: Parameters<typeof cor>[0]) => new THREE.Color(cor(k)).getHex();
  corJ = { normal: n('azul'), sel: n('acc'), ed: n('laranja'), aj: n('laranja') };
  rastroLinha.material.color.set(cor('acc'));
  const claro = TEMAS[cfg.tema].claro;
  hemi.intensity = claro ? 1.35 : 1.1;
}

// ---------------------------------------------------------------- estado
interface Animacao {
  id: string; nome: string; clip: THREE.AnimationClip; camadas: Camada[]; ativa: number; fps: number;
  origem?: number; poses?: PoseChave[]; nova?: boolean; excluidaEm?: number;
}
interface Modelo {
  carregado: ModeloCarregado;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  bones: Record<string, THREE.Bone>;        // nome do three → osso
  listaOssos: string[];
  original: (n: string) => string;            // nome do three → nome do arquivo
  repouso: MapaRepouso;                       // o que está nos nós do arquivo (o mixer parte daqui)
  bind: Map<string, { q: THREE.Quaternion; p: THREE.Vector3; mp: THREE.Vector3 }>;   // repouso da pele (local; mp = posição no modelo)
  rw: Map<string, THREE.Quaternion>;          // rotação de mundo (no espaço do modelo) no repouso da pele
  rwPai: Map<string, THREE.Quaternion>;
  pares: Map<string, string>;                 // espelho esquerda ↔ direita
  trs: Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>;
  materiais: [THREE.Mesh, THREE.Material | THREE.Material[], THREE.Material | THREE.Material[]][];
  malhas: THREE.SkinnedMesh[];
  encaixes: Encaixe[];
  arquivos: ArquivoEntrada[];
  chave: string;
  handle?: FileSystemFileHandle;
  podeSobrescrever: boolean;
}
let M: Modelo | null = null;
let anims: Animacao[] = [], lixeira: Animacao[] = [];
let mapaAuto: MapaCorpo = {}, mapaManual: MapaCorpo = {}, mapa: MapaCorpo = {};   // nomes do arquivo (manual) / do three (mapa)
let atual: Animacao | null = null, acaoAtual: THREE.AnimationAction | null = null;
let sujo = false, jaConfirmouSobrescrever = false, encaixesVistos = false;
let biblioteca: PoseGuardada[] = [];
const slotDe = (osso: string) => (Object.keys(mapa) as Slot[]).find((s) => mapa[s] === osso);
const rotulo = (osso: string) => { const s = slotDe(osso); return s ? nomeSlot(s) : M ? M.original(osso) : osso; };
const fpsA = () => atual?.fps ?? 30;
const camadaAtiva = (): CamadaAjuste | null => { const c = atual?.camadas[atual.ativa]; return c && c.tipo === 'ajuste' ? c : null; };
const ajAtual = (): AjustesClip => camadaAtiva()?.ajustes ?? {};
const ctxDe = (a: Animacao) => ({ clip: a.clip, fps: a.fps, rep: M!.repouso });
const camadasPadrao = (): Camada[] => [novaCamada(novoId(), 'Ajustes')];

// ---------------------------------------------------------------- aviso (toast)
let avisoT = 0;
function status(txt: string, tipo: '' | 'ok' | 'erro' = '', ms = 2600) {
  const el = $('aviso');
  el.textContent = txt;
  el.className = 'on ' + tipo;
  clearTimeout(avisoT);
  avisoT = window.setTimeout(() => { el.className = tipo; }, tipo === 'erro' ? Math.max(ms, 6000) : ms);
}

// ---------------------------------------------------------------- abrir modelo
function liberarModelo() {
  if (!M) return;
  M.mixer.stopAllAction();
  M.mixer.uncacheRoot(M.root);
  scene.remove(M.root);
  M.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); }
  });
  for (const [, , t] of M.materiais) (Array.isArray(t) ? t : [t]).forEach((x) => x.dispose());
  helper.clear();
  juntas.clear();
  marcadores.length = 0;
  tc.detach();
  acessorios = [];
  ajustandoAcessorio = null;
  M = null;
  atual = null; acaoAtual = null;
}

async function abrirArquivos(arquivos: ArquivoEntrada[], handle?: FileSystemFileHandle, salvo?: ProjetoSalvo) {
  const principal = arquivos.find((a) => ehModelo(a.nome));
  if (!principal) { status('Isso não parece um modelo 3D (.glb, .gltf, .vrm ou .fbx).', 'erro'); return; }
  const velho = salvo ?? await lerProjeto(principal.nome);
  if (!salvo && velho && (velho.sujo || velho.lixeira.length) && mesmosBytes(velho.arquivos, arquivos)) {
    if (await confirmar('Continuar de onde parou?', `Tem mudanças não salvas de "${principal.nome}" guardadas aqui.`, 'Continuar')) salvo = velho;
  }
  status('Abrindo…', '', 20000);
  let c: ModeloCarregado;
  try { c = await carregarModelo(arquivos); } catch (e) {
    status('Não deu pra abrir: ' + (e as Error).message, 'erro');
    return;
  }
  await montarModelo(c, arquivos, principal.nome, handle ?? salvo?.handle, salvo, undefined, velho ?? undefined);
  status(`${principal.nome} aberto.`, 'ok');
}
function mesmosBytes(a: ArquivoEntrada[], b: ArquivoEntrada[]) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.nome === b[i].nome && x.bytes.byteLength === b[i].bytes.byteLength);
}

/** extras = projeto antigo do mesmo arquivo: mapa manual, biblioteca de poses e acessórios valem mesmo sem "continuar". */
async function montarModelo(c: ModeloCarregado, arquivos: ArquivoEntrada[], chave: string, handle?: FileSystemFileHandle, salvo?: ProjetoSalvo,
  manter?: { anim?: string; q?: number }, extras?: ProjetoSalvo) {
  liberarModelo();
  const root = c.root;
  scene.add(root);
  root.updateMatrixWorld(true);
  const bones: Record<string, THREE.Bone> = {};
  const trs: Modelo['trs'] = new Map();
  const repouso: MapaRepouso = new Map();
  const materiais: Modelo['materiais'] = [];
  const malhas: THREE.SkinnedMesh[] = [];
  const ordem: string[] = [];
  root.traverse((o) => {
    trs.set(o, [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    if (o.name && !repouso.has(o.name)) repouso.set(o.name, { q: o.quaternion.clone(), p: o.position.clone(), s: o.scale.clone() });
    if ((o as THREE.Bone).isBone && !bones[o.name]) { bones[o.name] = o as THREE.Bone; ordem.push(o.name); }
    const m = o as THREE.Mesh;
    if (m.isMesh) prepararMalha(m, materiais, malhas);
  });
  // Pose de bind (a da pele): é o repouso "de verdade", simétrico. Os nós do arquivo às vezes guardam outra pose.
  // Serve de referência pro espelho e pros números (graus a partir do repouso).
  const bindMundo = new Map<THREE.Object3D, THREE.Matrix4>();
  for (const s of malhas) s.skeleton.bones.forEach((b, i) => { if (!bindMundo.has(b) && s.skeleton.boneInverses[i]) bindMundo.set(b, s.skeleton.boneInverses[i].clone().invert()); });
  const rootInv = root.matrixWorld.clone().invert();
  const cacheMR = new Map<THREE.Object3D, THREE.Matrix4>();
  const mundoRep = (o: THREE.Object3D): THREE.Matrix4 => {          // no espaço do modelo
    const ja = cacheMR.get(o);
    if (ja) return ja;
    let m: THREE.Matrix4;
    if (bindMundo.has(o)) m = rootInv.clone().multiply(bindMundo.get(o)!);
    else if (o === root || !o.parent) m = new THREE.Matrix4();
    else { const [p, q, s] = trs.get(o)!; m = mundoRep(o.parent).clone().multiply(new THREE.Matrix4().compose(p, q, s)); }
    cacheMR.set(o, m);
    return m;
  };
  const rw = new Map<string, THREE.Quaternion>(), rwPai = new Map<string, THREE.Quaternion>();
  const bind = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3; mp: THREE.Vector3 }>();
  const dec = (m: THREE.Matrix4) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q }; };
  for (const n of ordem) {
    const b = bones[n];
    const mw = mundoRep(b), mpai = b.parent ? mundoRep(b.parent) : new THREE.Matrix4();
    const w = dec(mw), l = dec(mpai.clone().invert().multiply(mw));
    rw.set(n, w.q);
    rwPai.set(n, dec(mpai).q);
    bind.set(n, { q: bindMundo.size ? l.q : repouso.get(n)!.q.clone(), p: bindMundo.size ? l.p : repouso.get(n)!.p.clone(), mp: w.p });
  }
  const orig = new Map<string, string>();
  for (const [o, n] of c.nomeOriginal) if (o.name && !orig.has(o.name)) orig.set(o.name, n);
  const original = (n: string) => orig.get(n) ?? n;
  const mixer = new THREE.AnimationMixer(root);
  // pares de espelho
  const profDe = (b: THREE.Object3D) => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
  const tamanho = new THREE.Box3().setFromObject(root, true).getSize(_v()).length() || 1;
  const pares = paresEspelho(ordem.map((n) => ({ nome: n, original: original(n), pos: bind.get(n)!.mp, prof: profDe(bones[n]) })), tamanho * 0.01);
  M = { carregado: c, root, mixer, bones, listaOssos: ordem, original, repouso, bind, rw, rwPai, pares, trs, materiais, malhas,
    encaixes: acharEncaixes(root, (o) => c.nomeOriginal.get(o) ?? o.name), arquivos, chave, handle,
    podeSobrescrever: !!handle && /\.(glb|vrm)$/i.test(handle.name) };
  jaConfirmouSobrescrever = false;
  // tamanho e câmera
  for (const s of malhas) s.skeleton.update();
  const caixa = new THREE.Box3().setFromObject(root, true);
  if (!caixa.isEmpty()) {
    const t = caixa.getSize(_v());
    ALTURA = Math.max(t.y, Math.max(t.x, t.z) * 0.6, 1e-3);
    CENTRO = caixa.getCenter(_v());
  }
  const chaoY = caixa.isEmpty() ? 0 : Math.min(0, caixa.min.y);
  const TAM = ALTURA * 10;
  CASA = ALTURA * 0.3;
  chao.scale.set(TAM, TAM, 1);
  chao.position.set(CENTRO.x, chaoY, CENTRO.z);
  texChao.repeat.set(TAM / (2 * CASA), TAM / (2 * CASA));
  controls.minDistance = ALTURA * 0.2;
  controls.maxDistance = ALTURA * 20;
  camera.near = ALTURA * 0.01;
  camera.far = ALTURA * 200;
  camera.updateProjectionMatrix();
  const ext = ALTURA * 1.8;
  Object.assign(sol.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: ALTURA * 0.05, far: ALTURA * 12 });
  sol.position.set(CENTRO.x + ALTURA * 2, CENTRO.y + ALTURA * 3.5, CENTRO.z + ALTURA * 2.5);
  sol.target.position.copy(CENTRO);
  sol.shadow.camera.updateProjectionMatrix();
  enquadrar('tres');
  const sh = new THREE.SkeletonHelper(root);
  helper.add(sh);
  helper.visible = false;
  montarJuntas();
  // mapa do corpo
  const infos: OssoInfo[] = ordem.map((n) => {
    const b = bones[n];
    const p = root.worldToLocal(b.getWorldPosition(_v()));
    const pai = b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : null;
    return { nome: original(n), pai: pai ? original(pai) : null, x: p.x };
  });
  const paraThree = new Map(ordem.map((n) => [original(n), n]));
  const autoOrig = mapaAutomatico(infos, c.vrm);
  mapaAuto = {};
  for (const s of Object.keys(autoOrig) as Slot[]) { const t = paraThree.get(autoOrig[s]!); if (t) mapaAuto[s] = t; }
  const base = salvo ?? extras;
  mapaManual = { ...(base?.mapa || {}) };
  biblioteca = base?.biblioteca ? [...base.biblioteca] : [];
  encaixesVistos = !!base?.encaixesVistos;
  recalcularMapa();
  // animações
  anims = []; lixeira = [];
  desfazer.length = refazer.length = 0;
  if (salvo) {
    const viva = (s: AnimSalva): Animacao | null => {
      let clip: THREE.AnimationClip | undefined;
      if (s.poses?.length) clip = gerarClipePoses(s.nome, s.clipe ? (s.clipe as { duration: number }).duration : c.clips[s.origem ?? -1]?.duration ?? 1, s.fps ?? 30, s.poses);
      else if (s.origem !== undefined && c.clips[s.origem]) clip = c.clips[s.origem];
      else if (s.clipe) clip = THREE.AnimationClip.parse(s.clipe as THREE.AnimationClipJSON);
      if (!clip) return null;
      clip.name = s.nome;
      const camadas = s.camadas?.length ? s.camadas : s.ajustes ? [{ ...novaCamada(novoId(), 'Ajustes'), ajustes: s.ajustes }] : camadasPadrao();
      return { id: s.id, nome: s.nome, clip, camadas, ativa: Math.min(s.ativa ?? 0, camadas.length - 1), fps: s.fps ?? 30,
        origem: s.clipe ? undefined : s.origem, poses: s.poses, nova: s.nova, excluidaEm: s.excluidaEm };
    };
    anims = salvo.anims.map(viva).filter(Boolean) as Animacao[];
    lixeira = salvo.lixeira.map(viva).filter(Boolean) as Animacao[];
    sujo = salvo.sujo;
  } else {
    anims = c.clips.map((clip, i) => ({ id: novoId(), nome: clip.name || `Animação ${i + 1}`, clip, camadas: camadasPadrao(), ativa: 0, fps: 30, origem: i }));
    for (const a of anims) a.clip.name = a.nome;
    sujo = false;
  }
  // interface
  $('vazio').hidden = true;
  $('modeloNome').textContent = chave + (c.formato === 'fbx' ? ' (FBX: salva como .glb)' : '');
  $('modeloNome').title = `${ordem.length} ossos · ${anims.length} animações`;
  for (const id of ['bSalvar', 'bSalvarMenu', 'bNova']) ($(id) as HTMLButtonElement).disabled = false;
  if (!ordem.length) status('Esse modelo não tem esqueleto: dá pra ver, mas não ajustar.', 'erro');
  ossoSel = null;
  const inicial = anims.find((a) => a.nome === manter?.anim) || anims.find((a) => a.id === salvo?.atual) || anims.find((a) => /idle/i.test(a.nome)) || anims[0];
  if (inicial) { tocar(inicial.id); if (manter?.q !== undefined && editando) irPara(manter.q / fpsA()); }
  else { $('titulo').textContent = ''; $('info').textContent = 'Sem animações: crie uma com o +'; }
  escolherOsso(null);
  mudou(false);
  if (toon) aplicarToon(true);
  // acessórios do projeto e aviso de encaixes
  for (const s of base?.acessorios || []) await anexarAcessorio(s, false);
  montarAcessorios();
  mostrarFaixaEncaixes();
}

function prepararMalha(m: THREE.Mesh, materiais: Modelo['materiais'], malhas?: THREE.SkinnedMesh[]) {
  m.castShadow = true;
  m.frustumCulled = false;
  if (malhas && (m as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(m as THREE.SkinnedMesh);
  const m0 = m.material;
  const toonM = (Array.isArray(m0) ? m0 : [m0]).map((x) => {
    const mm = x as THREE.MeshStandardMaterial;
    return new THREE.MeshToonMaterial({ color: mm.color, map: mm.map, gradientMap: grad, transparent: mm.transparent, alphaTest: mm.alphaTest, side: mm.side });
  });
  materiais.push([m, m0, Array.isArray(m0) ? toonM : toonM[0]]);
}

function recalcularMapa() {
  if (!M) return;
  const paraThree = new Map(M.listaOssos.map((n) => [M!.original(n), n]));
  mapa = { ...mapaAuto };
  for (const s of Object.keys(mapaManual) as Slot[]) {
    const v = mapaManual[s];
    if (v === '') delete mapa[s];
    else if (v && paraThree.has(v)) mapa[s] = paraThree.get(v);
  }
}

// ---------------------------------------------------------------- camadas por cima da animação
// O three.js só reescreve um osso quando o valor da animação MUDA: cada osso mexido aqui volta pra pose base antes
// do próximo quadro, senão o ajuste somaria de novo a cada quadro.
const mexidos = new Map<THREE.Object3D, [THREE.Quaternion, THREE.Vector3]>();
const QI = new THREE.Quaternion();
let verOriginal = false;
function marcar(b: THREE.Object3D) { if (!mexidos.has(b)) mexidos.set(b, [b.quaternion.clone(), b.position.clone()]); }
function restaurarBase() {
  for (const [b, [q, p]] of mexidos) { b.quaternion.copy(q); b.position.copy(p); }
  mexidos.clear();
}
function aplicarAjustes() {
  if (!M) return;
  for (const n of ossosEmEdicao()) if (M.bones[n]) marcar(M.bones[n]);
  if (verOriginal) return;
  for (const a of anims) {
    if (!temAjuste(a.camadas)) continue;
    const ac = M.mixer.existingAction(a.clip);
    if (!ac || !ac.enabled || !ac.isScheduled()) continue;   // parada (stop) continua "enabled" no three
    const w = ac.getEffectiveWeight();
    if (w <= 0.0001) continue;
    const f = ac.time * a.fps;
    const ctx = ctxDe(a);
    for (const nome of ossosMexidos(a.camadas, a.clip)) {
      const b = M.bones[nome] || M.root.getObjectByName(nome);
      if (!b) continue;
      const d = deltaCamadas(a.camadas, ctx, nome, f);
      if (!d.tem) continue;
      if (!Number.isFinite(d.q.x + d.q.y + d.q.z + d.q.w + d.p.x + d.p.y + d.p.z)) continue;   // conta inválida: ignora em vez de estragar a cena
      marcar(b);
      b.quaternion.multiply(w >= 0.9999 ? d.q : QI.clone().slerp(d.q, w));
      b.position.addScaledVector(d.p, w);
    }
  }
}
/** Põe a animação atual no quadro f (com camadas), sem mexer no "tocando". */
function avaliarEm(f: number) {
  if (!acaoAtual || !M) return;
  acaoAtual.time = Math.max(0, Math.min(acaoAtual.getClip().duration, f / fpsA()));
  restaurarBase();
  M.mixer.update(0);
  aplicarAjustes();
  M.root.updateMatrixWorld(true);
}
/** Troca o clipe de uma animação (tempo esticado, pose a pose regerada) sem perder o quadro. */
function trocarClipe(a: Animacao, novo: THREE.AnimationClip) {
  const velho = a.clip;
  novo.name = a.nome;
  a.clip = novo;
  esquecerClipe(velho);
  if (!M) return;
  const acv = M.mixer.existingAction(velho);
  if (acv) { acv.stop(); M.mixer.uncacheAction(velho); }
  if (a === atual) {
    const t = acv ? acv.time : 0;
    const nova = M.mixer.clipAction(novo);
    nova.setLoop(($('loop') as HTMLInputElement).checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    nova.clampWhenFinished = true;
    nova.play();
    nova.time = Math.min(t, novo.duration);
    nova.paused = !tocando;
    acaoAtual = nova;
    restaurarBase();
    M.mixer.update(0);
    infoAnim();
  }
}

// ---------------------------------------------------------------- desfazer / refazer
interface FotoAnim { a: Animacao; nome: string; camadas: string; ativa: number; fps: number; clip: THREE.AnimationClip; poses?: string; origem?: number; em?: number }
interface Foto { anims: FotoAnim[]; lixo: FotoAnim[]; atual?: string }
const desfazer: Foto[] = [], refazer: Foto[] = [];
const fotoAnim = (a: Animacao): FotoAnim => ({ a, nome: a.nome, camadas: JSON.stringify(a.camadas), ativa: a.ativa, fps: a.fps, clip: a.clip,
  poses: a.poses ? JSON.stringify(a.poses) : undefined, origem: a.origem, em: a.excluidaEm });
const foto = (): Foto => ({ anims: anims.map(fotoAnim), lixo: lixeira.map(fotoAnim), atual: atual?.id });
function guardarDesfazer() {
  desfazer.push(foto());
  if (desfazer.length > 200) desfazer.shift();
  refazer.length = 0;
}
function voltar(de: Foto[], para: Foto[]) {
  const s = de.pop();
  if (!s) return;
  para.push(foto());
  const q = quadroAtual();
  const viva = (x: FotoAnim) => {
    const a = x.a;
    a.nome = x.nome; a.camadas = JSON.parse(x.camadas); a.ativa = x.ativa; a.fps = x.fps; a.origem = x.origem; a.excluidaEm = x.em;
    a.poses = x.poses ? JSON.parse(x.poses) : undefined;
    let clip = x.clip;
    if (a.poses) clip = gerarClipePoses(a.nome, x.clip.duration, a.fps, a.poses);
    if (clip !== a.clip) trocarClipe(a, clip);
    a.clip.name = a.nome;
    return a;
  };
  anims = s.anims.map(viva);
  lixeira = s.lixo.map(viva);
  if (!atual || !anims.includes(atual)) { const a = anims.find((x) => x.id === s.atual) || anims[0]; if (a) tocar(a.id); else pararTudo(); }
  else if (editando) irPara(q / fpsA());
  mudou();
}

// ---------------------------------------------------------------- guardar o projeto no navegador
let guardarT = 0;
function mudou(marcarSujo = true) {
  if (marcarSujo) sujo = true;
  for (const a of anims) limparCamadas(a.camadas);
  $('bSalvar').classList.toggle('sujo', sujo);
  $('bSalvar').title = sujo ? 'Salvar .glb (Ctrl+S) · tem mudanças não salvas' : 'Salvar .glb (Ctrl+S)';
  ($('bDescartar') as HTMLButtonElement).disabled = !atual || !temAjuste(atual.camadas);
  montarLista();
  montarLixeira();
  montarPainelAjuste();
  rastroSujo = true;
  clearTimeout(guardarT);
  guardarT = window.setTimeout(guardarAgora, 500);
}
function paraSalvar(a: Animacao, sempreClipe = false): AnimSalva {
  const s: AnimSalva = { id: a.id, nome: a.nome, camadas: a.camadas, ativa: a.ativa, fps: a.fps, poses: a.poses, nova: a.nova, excluidaEm: a.excluidaEm };
  if (a.origem !== undefined && !sempreClipe) s.origem = a.origem;
  else s.clipe = THREE.AnimationClip.toJSON(a.clip);
  return s;
}
async function guardarAgora() {
  if (!M) return;
  const p: ProjetoSalvo = { chave: M.chave, nome: M.chave, arquivos: M.arquivos, anims: anims.map((a) => paraSalvar(a)),
    lixeira: lixeira.map((a) => paraSalvar(a, true)), mapa: mapaManual, handle: M.handle, sujo, atual: atual?.id, atualizado: Date.now(),
    biblioteca, acessorios: acessorios.map((x) => x.s), encaixesVistos };
  await guardarProjeto(p);
}

// ---------------------------------------------------------------- lista de animações e lixeira
function montarLista() {
  const f = ($('busca') as HTMLInputElement).value.trim().toLowerCase();
  const el = $('lista');
  el.innerHTML = '';
  for (const a of anims) {
    if (f && !a.nome.toLowerCase().includes(f)) continue;
    const it = document.createElement('div');
    it.className = 'item' + (a === atual ? ' ativo' : '');
    it.dataset.id = a.id;
    const temAj = temAjuste(a.camadas);
    it.innerHTML = `<span class="nome" title="${esc(a.nome)}">${esc(a.nome)}</span>${a.poses ? '<span class="tag" title="Pose a pose">poses</span>' : ''}${temAj || a.nova ? `<span class="marca-aj" title="${temAj ? 'Tem ajustes não salvos' : 'Nova (ainda não salva)'}">•</span>` : ''}
      <button class="mini" data-f="renomear" title="Renomear (F2)">${ICONES.renomear}</button>
      <button class="mini" data-f="duplicar" title="Duplicar">${ICONES.duplicar}</button>
      <button class="mini" data-f="excluir" title="Mandar pra lixeira">${ICONES.lixo}</button>`;
    it.querySelector('.nome')!.addEventListener('click', () => tocar(a.id));
    it.querySelector('.nome')!.addEventListener('dblclick', () => renomear(a));
    it.querySelector('[data-f=renomear]')!.addEventListener('click', () => renomear(a));
    it.querySelector('[data-f=duplicar]')!.addEventListener('click', () => duplicar(a));
    it.querySelector('[data-f=excluir]')!.addEventListener('click', () => excluir(a));
    el.appendChild(it);
  }
  if (M && !anims.length) el.innerHTML = '<div class="vazio-lista">Nenhuma animação.</div>';
}
$('busca').oninput = montarLista;
function montarLixeira() {
  const d = $('lixeira') as HTMLDetailsElement;
  d.hidden = !lixeira.length;
  $('nLixo').textContent = lixeira.length ? `(${lixeira.length})` : '';
  const el = $('listaLixo');
  el.innerHTML = '';
  for (const a of [...lixeira].reverse()) {
    const it = document.createElement('div');
    it.className = 'item';
    it.innerHTML = `<span class="nome" title="${esc(a.nome)}">${esc(a.nome)}</span><button class="mini" title="Restaurar">${ICONES.restaurar}</button>`;
    it.querySelector('button')!.addEventListener('click', () => restaurar(a));
    el.appendChild(it);
  }
}
const nomeLivre = (base: string, menos?: Animacao) => {
  const usado = (n: string) => anims.some((a) => a !== menos && a.nome.toLowerCase() === n.toLowerCase());
  if (!usado(base)) return base;
  for (let i = 2; ; i++) if (!usado(`${base} ${i}`)) return `${base} ${i}`;
};
function renomear(a: Animacao) {
  const it = $('lista').querySelector<HTMLElement>(`.item[data-id="${a.id}"]`);
  if (!it) return;
  const span = it.querySelector('.nome') as HTMLElement;
  const inp = Object.assign(document.createElement('input'), { className: 'renomear', value: a.nome });
  span.replaceWith(inp);
  inp.focus(); inp.select();
  let feito = false;
  const fim = (ok: boolean) => {
    if (feito) return;
    feito = true;
    const n = inp.value.trim();
    if (ok && n && n !== a.nome) {
      guardarDesfazer();
      a.nome = nomeLivre(n, a);
      a.clip.name = a.nome;
      if (a === atual) $('titulo').textContent = a.nome;
      mudou();
    } else montarLista();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fim(true); else if (e.key === 'Escape') fim(false); e.stopPropagation(); });
  inp.addEventListener('blur', () => fim(true));
}
function copiaDe(a: Animacao, nome: string): Animacao {
  const n: Animacao = { id: novoId(), nome, clip: a.clip.clone(), camadas: JSON.parse(JSON.stringify(a.camadas)), ativa: a.ativa, fps: a.fps,
    poses: a.poses ? JSON.parse(JSON.stringify(a.poses)) : undefined, nova: true };
  n.clip.name = nome;
  return n;
}
function duplicar(a: Animacao) {
  guardarDesfazer();
  const nova = copiaDe(a, nomeLivre(a.nome + ' (cópia)'));
  anims.splice(anims.indexOf(a) + 1, 0, nova);
  tocar(nova.id);
  mudou();
  status(`"${nova.nome}" criada.`, 'ok');
  return nova;
}
async function excluir(a: Animacao) {
  if (!(await confirmar('Mandar pra lixeira?', `"${a.nome}" sai da lista e não vai no próximo salvamento. Dá pra restaurar pela lixeira.`, 'Mandar pra lixeira', true))) return;
  guardarDesfazer();
  const i = anims.indexOf(a);
  anims.splice(i, 1);
  a.excluidaEm = Date.now();
  lixeira.push(a);
  if (a === atual) { const prox = anims[Math.min(i, anims.length - 1)]; if (prox) tocar(prox.id); else pararTudo(); }
  mudou();
  status(`"${a.nome}" foi pra lixeira.`, 'ok');
}
function restaurar(a: Animacao) {
  guardarDesfazer();
  lixeira.splice(lixeira.indexOf(a), 1);
  a.excluidaEm = undefined;
  a.nome = nomeLivre(a.nome);
  a.clip.name = a.nome;
  anims.push(a);
  tocar(a.id);
  mudou();
  status(`"${a.nome}" voltou da lixeira.`, 'ok');
}
$('bEsvaziar').onclick = async () => {
  const n = lixeira.length;
  if (!n) return;
  if (!(await confirmar('Esvaziar a lixeira?', `${n} animação(ões) vão ser apagadas de vez. Isso não dá pra desfazer.`, 'Apagar de vez', true))) return;
  lixeira = [];
  desfazer.length = refazer.length = 0;    // o desfazer guardava referências às apagadas
  mudou();
};

async function novaAnimacao() {
  if (!M) return;
  const q = quadroAtual();
  const temAtual = !!atual;
  const { botao, form } = await abrirDialogo(`<h3>Nova animação</h3>
    <label class="campo"><span>Nome</span><input type="text" name="nome" value="${esc(nomeLivre('Nova animação'))}" autofocus></label>
    <label class="campo"><span>Duração (segundos)</span><input type="number" name="dur" value="1" min="0.1" max="600" step="0.1"></label>
    <div class="campo"><span>Começar de</span><div class="radios">
      <label><input type="radio" name="de" value="repouso" checked> Pose de repouso</label>
      <label class="${temAtual ? '' : 'off'}"><input type="radio" name="de" value="pose" ${temAtual ? '' : 'disabled'}> Pose atual${temAtual ? ` (${esc(atual!.nome)}, quadro ${q})` : ''}</label>
      <label class="${temAtual ? '' : 'off'}"><input type="radio" name="de" value="copia" ${temAtual ? '' : 'disabled'}> Cópia de ${temAtual ? esc(atual!.nome) : 'uma animação'}</label>
    </div></div>
    <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">Criar</button></div>`,
  (f) => {
    const dur = f.elements.namedItem('dur') as HTMLInputElement;
    for (const r of f.querySelectorAll<HTMLInputElement>('input[name=de]')) r.onchange = () => { dur.disabled = r.value === 'copia' && r.checked; };
  });
  if (botao !== 'ok') return;
  const fd = new FormData(form);
  const nome = nomeLivre(String(fd.get('nome') || '').trim() || 'Nova animação');
  const de = String(fd.get('de'));
  if (de === 'copia' && atual) {
    const a = duplicar(atual);
    a.nome = nomeLivre(nome, a); a.clip.name = a.nome;
    mudou();
    tocar(a.id);
    return;
  }
  const dur = Math.max(0.1, Number(fd.get('dur')) || 1);
  const pose = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  const comPos = new Set<string>();
  if (de === 'pose') for (const n of M.listaOssos) { const b = M.bones[n]; pose.set(n, { q: b.quaternion.clone(), p: b.position.clone() }); }
  else for (const n of M.listaOssos) { const r = M.repouso.get(n)!; pose.set(n, { q: r.q.clone(), p: r.p.clone() }); }
  for (const [n, v] of pose) {
    const r = M.repouso.get(n);
    if (n === mapa.quadril || (r && r.p.distanceTo(v.p) > 1e-6)) comPos.add(n);
  }
  guardarDesfazer();
  const a: Animacao = { id: novoId(), nome, clip: clipeParado(nome, dur, pose, comPos), camadas: camadasPadrao(), ativa: 0, fps: 30, nova: true };
  anims.push(a);
  tocar(a.id);
  mudou();
  if (!editando) entrarEdicao(true);
  status(`"${nome}" criada. Escolha um osso e ajuste.`, 'ok');
}
$('bNova').onclick = novaAnimacao;

// ---------------------------------------------------------------- reprodução
let tocando = true;
function pararTudo() {
  if (!M) return;
  M.mixer.stopAllAction();
  atual = null; acaoAtual = null;
  $('titulo').textContent = ''; $('info').textContent = '';
}
function infoAnim() {
  if (!atual) return;
  $('titulo').textContent = atual.nome;
  $('info').textContent = `${fmt(atual.clip.duration)} s · ${quadros() + 1} quadros · ${atual.fps} fps` + (atual.poses ? ` · pose a pose (${atual.poses.length} poses)` : '');
  campoDur.definir(atual.clip.duration);
  campoFps.definir(atual.fps);
}
function tocar(id: string) {
  if (!M) return;
  const a = anims.find((x) => x.id === id);
  if (!a) return;
  const nova = M.mixer.clipAction(a.clip);
  nova.reset();
  nova.setLoop(($('loop') as HTMLInputElement).checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  nova.clampWhenFinished = true;
  nova.play();
  const fade = editando ? 0 : parseFloat(($('fade') as HTMLInputElement).value);
  if (acaoAtual && acaoAtual !== nova && fade > 0) acaoAtual.crossFadeTo(nova, fade, false);
  else if (acaoAtual && acaoAtual !== nova) acaoAtual.stop();
  for (const x of anims) { const ac = M.mixer.existingAction(x.clip); if (ac && ac !== nova && ac !== acaoAtual) ac.stop(); }
  for (const x of lixeira) M.mixer.existingAction(x.clip)?.stop();
  acaoAtual = nova;
  atual = a;
  linha.loopA = linha.loopB = null;
  infoAnim();
  if (editando) irPara(0); else definirTocando(true);
  mudou(false);
}
const quadros = () => (acaoAtual ? Math.round(acaoAtual.getClip().duration * fpsA()) : 0);
const quadroAtual = () => (acaoAtual ? Math.round(acaoAtual.time * fpsA()) : 0);
function definirTocando(t: boolean) {
  tocando = t;
  $('bPlay').textContent = t ? '❚❚' : '▶';
  if (acaoAtual) acaoAtual.paused = !t;
  prenderGizmo();
}
function irPara(t: number) {
  if (!acaoAtual || !M) return;
  for (const x of anims) { const ac = M.mixer.existingAction(x.clip); if (ac && ac !== acaoAtual) ac.stop(); }
  acaoAtual.enabled = true;
  acaoAtual.setEffectiveWeight(1);
  acaoAtual.time = Math.max(0, Math.min(acaoAtual.getClip().duration, t));
  if (tocando) definirTocando(false);
  restaurarBase();
  M.mixer.update(0);
  painelSujo = true;
}
const passo = (d: number) => acaoAtual && irPara((quadroAtual() + d) / fpsA());
function pularChave(d: 1 | -1) {
  const ks = [...linhaChaves().keys()].sort((a, b) => a - b);
  const q = quadroAtual();
  const k = d > 0 ? ks.find((x) => x > q) : [...ks].reverse().find((x) => x < q);
  if (k !== undefined) irPara(k / fpsA());
}
$('bPlay').onclick = () => definirTocando(!tocando);
$('bAnt').onclick = () => passo(-1);
$('bProx').onclick = () => passo(1);
$('vel').oninput = (e) => { $('velV').textContent = fmt(+(e.target as HTMLInputElement).value) + 'x'; };
$('fade').oninput = (e) => { $('fadeV').textContent = fmt(+(e.target as HTMLInputElement).value) + ' s'; };
$('loop').onchange = () => acaoAtual && acaoAtual.setLoop(($('loop') as HTMLInputElement).checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
let toon = false;
function aplicarToon(sim: boolean) {
  toon = sim;
  if (M) for (const [o, m0, t] of M.materiais) o.material = sim ? t : m0;
}
$('cToon').onchange = (e) => aplicarToon((e.target as HTMLInputElement).checked);
for (const b of document.querySelectorAll<HTMLElement>('[data-cam]')) b.onclick = () => enquadrar(b.dataset.cam);
for (const b of document.querySelectorAll<HTMLElement>('[data-z]')) b.onclick = () => zoom(+b.dataset.z!);
$('bReset').onclick = () => enquadrar();

// duração e fps da animação (Ver › Animação)
let durPend: number | null = null, fpsPend: number | null = null;
const campoDur = new CampoNumero({ rotulo: 'Duração', titulo: 'Duração em segundos. Mudar estica ou encurta a animação toda (as chaves vão junto)', passo: 0.01, casas: 2, sufixo: ' s',
  comecar: () => !!atual, mudar: (v) => { durPend = Math.max(0.05, v); }, terminar: () => { if (durPend && atual) mudarDuracao(atual, durPend); durPend = null; } });
const campoFps = new CampoNumero({ rotulo: 'FPS', titulo: 'Quadros por segundo das chaves de ajuste (o tempo da animação não muda)', passo: 0.1, casas: 0,
  comecar: () => !!atual, mudar: (v) => { fpsPend = Math.round(Math.min(240, Math.max(1, v))); }, terminar: () => { if (fpsPend && atual) mudarFps(atual, fpsPend); fpsPend = null; } });
campoDur.el.classList.add('largo'); campoFps.el.classList.add('largo');
$('camposAnim').append(campoDur.el, campoFps.el);
$('camposAnim').style.gridTemplateColumns = '1fr 1fr';
campoDur.el.style.gridColumn = campoFps.el.style.gridColumn = 'auto';

function retimeAnim(a: Animacao, g: (t: number) => number, novaDur: number, quebras: number[] = []) {
  guardarDesfazer();
  const gf = (f: number) => g(f / a.fps) * a.fps;
  for (const c of a.camadas) if (c.tipo === 'ajuste') remapearChaves(c.ajustes, gf);
  let clip: THREE.AnimationClip;
  if (a.poses) {
    const vistos = new Set<number>();
    a.poses = a.poses.map((p) => ({ ...p, f: Math.round(gf(p.f)) })).filter((p) => (vistos.has(p.f) ? false : (vistos.add(p.f), true)));
    clip = gerarClipePoses(a.nome, novaDur, a.fps, a.poses);
  } else clip = retimeClip(a.clip, g, novaDur, quebras);
  a.origem = undefined;
  trocarClipe(a, clip);
  mudou();
}
function mudarDuracao(a: Animacao, dur: number) {
  const k = dur / a.clip.duration;
  if (Math.abs(k - 1) < 1e-4) return;
  retimeAnim(a, (t) => t * k, dur);
  status(`"${a.nome}" agora tem ${fmt(dur)} s.`, 'ok');
}
function mudarFps(a: Animacao, fps: number) {
  if (fps === a.fps) return;
  guardarDesfazer();
  const k = fps / a.fps;
  for (const c of a.camadas) if (c.tipo === 'ajuste') remapearChaves(c.ajustes, (f) => f * k);
  if (a.poses) a.poses = a.poses.map((p) => ({ ...p, f: Math.round(p.f * k) }));
  a.fps = fps;
  if (a.poses) trocarClipe(a, gerarClipePoses(a.nome, a.clip.duration, fps, a.poses));
  infoAnim();
  mudou();
}

// ---------------------------------------------------------------- ajudas visuais (liga/desliga)
const ver = { juntas: true, rastro: true, limpo: false, fantasmas: false };
function atualizarAjudas() {
  $('tJuntas').classList.toggle('on', ver.juntas);
  $('tRastro').classList.toggle('on', ver.rastro);
  $('tLimpo').classList.toggle('on', ver.limpo);
  $('tFantasmas').classList.toggle('on', ver.fantasmas);
  $('tOssos').classList.toggle('on', helper.visible);
  juntas.visible = editando && ver.juntas && !ver.limpo;
  rastroLinha.visible = rastroPontos.visible = ver.rastro && !ver.limpo && rastroTem;
  prenderGizmo();
  rastroSujo = true;
}
$('tJuntas').onclick = () => { ver.juntas = !ver.juntas; atualizarAjudas(); };
$('tRastro').onclick = () => { ver.rastro = !ver.rastro; atualizarAjudas(); };
$('tLimpo').onclick = () => { ver.limpo = !ver.limpo; atualizarAjudas(); };
$('tFantasmas').onclick = () => { ver.fantasmas = !ver.fantasmas; atualizarAjudas(); if (ver.fantasmas && tocando) status('Os fantasmas aparecem com a animação parada.'); };
$('tOssos').onclick = () => { helper.visible = !helper.visible; atualizarAjudas(); };
$('tAjuda').onclick = () => { $('atalhos').hidden = !$('atalhos').hidden; };

// ---------------------------------------------------------------- linha do tempo e painel de chaves
const POSES = '__poses';
function ossosDaLinha() {             // de quem são os losangos: selecionado (ou todos, sem seleção)
  const A = ajAtual();
  const sel = ossosEmEdicao();
  return sel.length ? sel.filter((n) => A[n]) : Object.keys(A);
}
function linhaChaves(): Map<number, boolean> {
  if (atual?.poses) return new Map(atual.poses.map((p) => [p.f, false]));
  return chavesPorQuadro(ajAtual(), ossosDaLinha());
}
function moverPose(de: number, para: number): boolean {
  const a = atual!;
  if (!a.poses || a.poses.some((p) => p.f === para) || para < 0 || para > quadros()) return false;
  const p = a.poses.find((x) => x.f === de);
  if (!p) return false;
  p.f = para;
  a.poses.sort((x, y) => x.f - y.f);
  trocarClipe(a, gerarClipePoses(a.nome, a.clip.duration, a.fps, a.poses));
  return true;
}
const linha = new LinhaTempo($<HTMLCanvasElement>('linha'), {
  quadros,
  quadroAgora: () => (acaoAtual ? acaoAtual.time * fpsA() : 0),
  chaves: linhaChaves,
  chavesOutros: () => { if (atual?.poses) return new Map(); const meus = ossosDaLinha(); return chavesPorQuadro(ajAtual(), Object.keys(ajAtual()).filter((o) => !meus.includes(o))); },
  interp: (q) => (atual?.poses ? atual.poses.find((p) => p.f === q)?.i : interpNoQuadro(ajAtual(), ossosDaLinha(), q)),
  irPara: (q) => irPara(q / fpsA()),
  comecarArrasteChave: guardarDesfazer,
  moverChave: (de, para) => {
    const ok = atual?.poses ? moverPose(de, para) : moverChave(ajAtual(), ossosDaLinha(), de, para);
    if (ok) rastroSujo = true;
    return ok;
  },
  fimArrasteChave: (moveu) => { if (moveu) mudou(); else desfazer.pop(); },
  loopMudou: (_a, _b, tocarJa) => { rastroSujo = true; if (tocarJa) definirTocando(true); },
});
$('bLoopX').onclick = () => linha.tirarLoop();

const painel = new PainelChaves($<HTMLCanvasElement>('chavesCanvas'), {
  quadros,
  quadroAgora: () => (acaoAtual ? acaoAtual.time * fpsA() : 0),
  linhas: () => {
    if (!atual) return [];
    if (atual.poses) return [{ osso: POSES, rotulo: 'Poses', chaves: atual.poses.map((p) => p.f), sel: false }];
    const A = ajAtual();
    const ordem = M ? M.listaOssos.filter((n) => A[n]) : Object.keys(A);
    return ordem.map((n) => ({ osso: n, rotulo: rotulo(n), chaves: [...chavesPorQuadro(A, [n]).entries()].filter(([, z]) => !z || true).map(([q]) => q), sel: n === ossoSel }));
  },
  irPara: (q) => irPara(q / fpsA()),
  escolherOsso: (n) => { if (n !== POSES) escolherOsso(n); },
  comecarArraste: guardarDesfazer,
  moverChave: (ossos, de, para) => {
    if (atual?.poses) return moverPose(de, para);
    const ok = moverChave(ajAtual(), ossos ?? Object.keys(ajAtual()), de, para);
    if (ok) rastroSujo = true;
    return ok;
  },
  fimArraste: (moveu) => { if (moveu) mudou(); else desfazer.pop(); },
  curvas: curvasDoOsso,
  comecarCurva: (f) => {
    if (!ossoSel || !atual) return false;
    irPara(f / fpsA());
    avaliarEm(f);
    curvaIni = M!.repouso.get(ossoSel)!.q.clone().invert().multiply(M!.bones[ossoSel].quaternion);
    return comecarEdicao(new Map([[ossoSel, ['rot']]]), { tipo: 'momento', raio: 1 }, true);
  },
  editarCurva: (_f, eixo, valor) => {
    if (!edicao || !ossoSel || !curvaIni) return;
    const e = new THREE.Euler().setFromQuaternion(curvaIni, 'XYZ');
    const arr = [e.x, e.y, e.z];
    arr[eixo] = valor * RAD;
    const q = M!.repouso.get(ossoSel)!.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(arr[0], arr[1], arr[2], 'XYZ')));
    escreverEdicao(new Map([[ossoSel, { q }]]));
  },
  fimCurva: () => { curvaIni = null; terminarEdicao(); },
});
let curvaIni: THREE.Quaternion | null = null;
function curvasDoOsso() {
  if (!M || !atual || !ossoSel) return null;
  const n = quadros();
  const rep = M.repouso.get(ossoSel)!;
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const e = new THREE.Euler();
  let ant: number[] | null = null;
  for (let f = 0; f <= n; f++) {
    const v = valorAjustado(atual.clip, verOriginal ? [] : atual.camadas, ossoSel, Math.min(atual.clip.duration, f / atual.fps), atual.fps, rep, M.repouso);
    e.setFromQuaternion(rep.q.clone().invert().multiply(v.q), 'XYZ');
    const g = [e.x / RAD, e.y / RAD, e.z / RAD];
    if (ant) for (let i = 0; i < 3; i++) { while (g[i] - ant[i] > 180) g[i] -= 360; while (g[i] - ant[i] < -180) g[i] += 360; }
    ant = g;
    xs.push(g[0]); ys.push(g[1]); zs.push(g[2]);
  }
  const chaves = atual.poses ? atual.poses.map((p) => p.f) : [...chavesPorQuadro(ajAtual(), ossosEmEdicao().length ? [ossoSel] : []).keys()];
  return { eixos: [{ nome: 'X', cor: cor('vermelho'), valores: xs }, { nome: 'Y', cor: cor('verde'), valores: ys }, { nome: 'Z', cor: cor('azul'), valores: zs }], chaves, unidade: '°' };
}
function abrirPainelChaves(sim = $('painelChaves').hidden) {
  $('painelChaves').hidden = !sim;
  $('bChaves').classList.toggle('on', sim);
}
$('bChaves').onclick = () => abrirPainelChaves();
$('pcDope').onclick = () => { painel.modo = 'dope'; $('pcDope').classList.add('on'); $('pcCurvas').classList.remove('on'); };
$('pcCurvas').onclick = () => { painel.modo = 'curvas'; $('pcCurvas').classList.add('on'); $('pcDope').classList.remove('on'); };

// ---------------------------------------------------------------- rastro do movimento (o caminho inteiro)
const rastroLinha = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfabd2f, transparent: true, opacity: 0.85, depthTest: false }));
const rastroPontos = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthTest: false }));
rastroLinha.renderOrder = rastroPontos.renderOrder = 998;
rastroLinha.frustumCulled = rastroPontos.frustumCulled = false;
scene.add(rastroLinha, rastroPontos);
let rastroSujo = true, rastroT = 0, rastroTem = false;
function pontoRastro(): (() => THREE.Vector3) | null {
  if (!M || !ossoSel) return null;
  const m = ferramenta === 'mover' ? modoMover(ossoSel) : null;
  if (m?.tipo === 'cadeia') { const b = M.bones[m.ponta]; return () => b.getWorldPosition(_v()); }
  const b0 = M.bones[ossoSel];
  if (m?.tipo === 'quadril') return () => b0.getWorldPosition(_v());
  const filho = filhoPrincipal(b0);
  const b = filho || b0;
  return () => b.getWorldPosition(_v());
}
function calcularRastro() {
  rastroSujo = false;
  rastroT = performance.now();
  const pega = (ver.rastro && !ver.limpo && acaoAtual && M) ? pontoRastro() : null;
  rastroTem = !!pega;
  rastroLinha.visible = rastroPontos.visible = rastroTem;
  if (!pega || !M || !acaoAtual) return;
  const n = quadros();
  // o trecho marcado pode ter ficado maior que a animação (esticar, duração, trocar de animação): limita
  let a = linha.loopA !== null ? linha.loopA : 0, b = linha.loopB !== null ? linha.loopB : n;
  a = Math.max(0, Math.min(n, Math.round(a))); b = Math.max(a, Math.min(n, Math.round(b)));
  const t0 = acaoAtual.time;
  const pts: THREE.Vector3[] = [], cores: number[] = [];
  const chaves = linhaChaves();
  const ca = new THREE.Color(cor('acc')), cn = new THREE.Color(cor('txt'));
  for (let f = a; f <= b; f++) {
    avaliarEm(f);
    pts.push(pega());
    const c = chaves.has(f) && !chaves.get(f) ? ca : cn;
    cores.push(c.r, c.g, c.b);
  }
  if (!pts.length || pts.some((p) => !p || !Number.isFinite(p.x + p.y + p.z))) { rastroTem = false; rastroLinha.visible = rastroPontos.visible = false; return; }
  // geometria nova a cada vez: setFromPoints num buffer que já existe quebra quando o rastro encolhe (causava o congelamento)
  rastroLinha.geometry.dispose(); rastroPontos.geometry.dispose();
  rastroLinha.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  rastroPontos.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  rastroPontos.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  acaoAtual.time = t0;
  restaurarBase();
  M.mixer.update(0);
  aplicarAjustes();
  M.root.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- fantasmas (onion skin)
const matFantasma = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false });
function renderizar() {
  const usar = ver.fantasmas && !ver.limpo && !!M && !!acaoAtual && !tocando && !tc.dragging && !edicao;
  if (!usar || !M || !acaoAtual) { renderer.render(scene, camera); return; }
  const n = quadros(), f0 = quadroAtual();
  renderer.autoClear = false;
  renderer.clear();
  renderer.render(scene, camera);
  const vis = scene.children.map((c) => c.visible);
  scene.children.forEach((c) => { c.visible = c === M!.root; });
  const fundo = scene.background;
  scene.background = null;
  scene.overrideMaterial = matFantasma;
  const passoF = Math.max(1, cfg.passoFantasma);
  const corAnt = new THREE.Color(cor('laranja')), corDep = new THREE.Color(cor('azul'));
  for (let k = cfg.fantasmas; k >= 1; k--) {
    for (const lado of [-1, 1]) {
      const f = f0 + lado * k * passoF;
      if (f < 0 || f > n) continue;
      avaliarEm(f);
      matFantasma.color.copy(lado < 0 ? corAnt : corDep);
      matFantasma.opacity = 0.32 - 0.08 * (k - 1);
      renderer.render(scene, camera);
    }
  }
  scene.overrideMaterial = null;
  scene.background = fundo;
  scene.children.forEach((c, i) => { c.visible = vis[i]; });
  avaliarEm(f0);
  renderer.autoClear = true;
}

// ---------------------------------------------------------------- modo de ajuste: seleção, gizmo
type TipoEd = 'rot' | 'pos';
type ModoMover = { tipo: 'quadril' } | { tipo: 'cadeia'; girados: string[]; ponta: string; resolver: (alvo: THREE.Vector3) => void; nome: string };
let editando = false, ossoSel: string | null = null, ferramenta: 'girar' | 'mover' = 'girar';
let escopoSel: 'momento' | 'trecho' | 'tudo' = 'momento';
const tc = new TransformControls(camera, canvas);
tc.setSize(1.0);
tc.enabled = false;
const tcHelper = tc.getHelper();
tcHelper.visible = false;
scene.add(tcHelper);
tc.addEventListener('dragging-changed', (e) => { controls.enabled = !(e as unknown as { value: boolean }).value; });
const alvoIK = new THREE.Object3D();
scene.add(alvoIK);
const juntas = new THREE.Group();
juntas.visible = false;
scene.add(juntas);
const geoJ = new THREE.SphereGeometry(1, 14, 10);
const marcadores: THREE.Mesh[] = [];
function montarJuntas() {
  juntas.clear();
  marcadores.length = 0;
  if (!M) return;
  for (const n of M.listaOssos) {
    const m = new THREE.Mesh(geoJ, new THREE.MeshBasicMaterial({ color: corJ.normal, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 999;
    m.userData.osso = n;
    juntas.add(m);
    marcadores.push(m);
  }
}
function ossosAjustados(): Set<string> {
  const s = new Set<string>();
  if (atual) for (const c of atual.camadas) if (c.tipo === 'ajuste') for (const o of Object.keys(c.ajustes)) s.add(o);
  return s;
}
function atualizarJuntas() {
  if (!M) return;
  const r = ALTURA * 0.016;
  const aj = ossosAjustados();
  const ed = new Set(ossosEmEdicao());
  const comMapa = new Set(Object.values(mapa));
  for (const m of marcadores) {
    const n = m.userData.osso as string;
    M.bones[n].getWorldPosition(m.position);
    const sel = n === ossoSel;
    m.scale.setScalar(sel ? r * 1.5 : ed.has(n) ? r * 1.2 : comMapa.has(n) ? r : r * 0.65);
    (m.material as THREE.MeshBasicMaterial).color.setHex(sel ? corJ.sel : ed.has(n) ? corJ.ed : aj.has(n) ? corJ.aj : corJ.normal);
  }
}
const ehOsso = (o: THREE.Object3D | null): o is THREE.Bone => !!o && (o as THREE.Bone).isBone;
const nDesc = (b: THREE.Object3D) => { let n = 0; b.traverse(() => { n++; }); return n; };
function filhoPrincipal(b: THREE.Object3D): THREE.Bone | null {
  const fs = b.children.filter(ehOsso);
  if (!fs.length) return null;
  const mapeados = new Set(Object.values(mapa));
  const coluna = new Set(['barriga', 'peito', 'pescoco', 'cabeca'].map((s) => mapa[s as Slot]).filter(Boolean));
  const meio = (n: string) => !M || (M.pares.get(n) ?? n) === n;
  const nota = (n: string) => (coluna.has(n) ? 4 : 0) + (meio(n) ? 2 : 0) + (mapeados.has(n) ? 1 : 0);
  return fs.sort((x, y) => nota(y.name) - nota(x.name) || nDesc(y) - nDesc(x))[0];
}
function cadeiaDe(ponta: Slot | null): string[] | null {
  if (!M || !ponta) return null;
  const c = cadeiaIK(mapa, ponta);
  if (!c) return null;
  const [A, B, C] = c.map((n) => M!.bones[n]);
  return A && B && C && ehAncestral(A, B) && ehAncestral(B, C) ? c : null;
}
function poleReserva(cadeia: string[]) {
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(M!.root.getWorldQuaternion(new THREE.Quaternion()));
  return slotDe(cadeia[2])?.startsWith('pe') ? frente : frente.negate();
}
/** O que "mover" faz com o osso: leva a junta (bolinha) pro lugar novo girando os ossos certos. */
function modoMover(osso: string | null): ModoMover | null {
  if (!osso || !M) return null;
  const B = M.bones;
  const b = B[osso];
  if (!b) return null;
  const slot = slotDe(osso);
  const [base, lado] = slot ? slot.split('.') : [''];
  const ik = (ponta: Slot, nome: string): ModoMover | null => {
    const c = cadeiaDe(ponta);
    if (!c) return null;
    return { tipo: 'cadeia', girados: c, ponta: c[2], nome, resolver: (alvo) => resolverIK(B[c[0]], B[c[1]], B[c[2]], alvo, poleReserva(c)) };
  };
  const aponta = (pai: THREE.Bone, ponta: THREE.Bone, nome: string): ModoMover => ({ tipo: 'cadeia', girados: [pai.name], ponta: ponta.name, nome, resolver: (alvo) => apontar(pai, ponta, alvo) });
  if (base === 'quadril') return { tipo: 'quadril' };
  if (base === 'mao' || base === 'pe') { const m = ik(slot!, 'IK'); if (m) return m; }
  if (base === 'antebraco' || base === 'canela') {
    const c = cadeiaDe(`${base === 'antebraco' ? 'mao' : 'pe'}.${lado}` as Slot);
    if (c && c[1] === osso) return { tipo: 'cadeia', girados: c, ponta: c[1], nome: 'meio', resolver: (alvo) => moverMeio(B[c[0]], B[c[1]], B[c[2]], alvo, poleReserva(c)) };
  }
  if (base === 'braco') {
    if (ehOsso(b.parent) && slotDe(b.parent.name)?.startsWith('ombro')) return aponta(b.parent, b, 'ombro');
    const m = ik(`mao.${lado}` as Slot, 'IK'); if (m) return m;
  }
  if (base === 'coxa') { const m = ik(`pe.${lado}` as Slot, 'IK'); if (m) return m; }
  if (base === 'ombro') { const f = filhoPrincipal(b); if (f) return aponta(b, f, 'ombro'); }
  if (base === 'barriga' || base === 'peito' || base === 'pescoco') {
    const ponta = filhoPrincipal(b);
    if (ponta) {
      const cadeia: THREE.Bone[] = [b];
      for (let p = b.parent; ehOsso(p) && p.name !== mapa.quadril; p = p.parent) cadeia.unshift(p);
      return { tipo: 'cadeia', girados: cadeia.map((x) => x.name), ponta: ponta.name, nome: 'coluna', resolver: (alvo) => curvarCadeia(cadeia, ponta, alvo) };
    }
  }
  if (ehOsso(b.parent) && b.parent.name !== mapa.quadril) return aponta(b.parent, b, 'pai');
  return null;
}
function ossosEmEdicao(): string[] {
  if (!ossoSel) return [];
  if (ferramenta === 'mover') {
    const m = modoMover(ossoSel);
    if (m?.tipo === 'cadeia') return m.girados;
  }
  return [ossoSel];
}
let ajustandoAcessorio: Acessorio | null = null;
function prenderGizmo() {
  tc.detach();
  let ativo = false;
  tc.setRotationSnap(cfg.snapRot ? cfg.snapRot * RAD : null);
  tc.setTranslationSnap(cfg.snapPos || null);
  if (ajustandoAcessorio && !ver.limpo) {
    tc.setMode(modoAcessorio === 'girar' ? 'rotate' : 'translate');
    tc.setSpace('local');
    tc.attach(ajustandoAcessorio.grupo);
    ativo = true;
  } else if (editando && !!ossoSel && !tocando && !ver.limpo && !!M && !!M.bones[ossoSel]) {   // osso que sumiu (troca de modelo/clipe): sem gizmo
    const rodar = ferramenta === 'girar';
    tc.setMode(rodar ? 'rotate' : 'translate');
    tc.setSpace(cfg.espaco === 'mundo' ? 'world' : (rodar ? 'local' : 'world'));
    if (rodar) { tc.attach(M.bones[ossoSel!]); ativo = true; }
    else {
      const m = modoMover(ossoSel);
      if (m?.tipo === 'quadril') { tc.attach(M.bones[ossoSel!]); ativo = true; }
      else if (m?.tipo === 'cadeia') { M.bones[m.ponta].getWorldPosition(alvoIK.position); alvoIK.updateMatrixWorld(true); tc.attach(alvoIK); ativo = true; }
    }
  }
  tc.enabled = ativo;
  tcHelper.visible = ativo;
}
function entrarEdicao(sim: boolean) {
  editando = sim;
  $('abaAjustar').classList.toggle('on', sim);
  $('abaVer').classList.toggle('on', !sim);
  $('painelAjustar').hidden = !sim;
  $('painelVer').hidden = sim;
  if (sim && acaoAtual) irPara(quadroAtual() / fpsA());
  if (!sim) $('etiqueta').style.display = 'none';
  atualizarAjudas();
  montarPainelAjuste();
}
$('abaAjustar').onclick = () => entrarEdicao(true);
$('abaVer').onclick = () => entrarEdicao(false);
function escolherOsso(n: string | null) {
  ossoSel = n && M?.bones[n] ? n : null;
  if (ossoSel && ferramenta === 'mover' && !modoMover(ossoSel)) ferramenta = 'girar';
  $('ossoNome').textContent = ossoSel ? rotulo(ossoSel) : '—';
  $('ossoNome').title = ossoSel && M ? M.original(ossoSel) : '';
  $('ossoSub').textContent = ossoSel && M && slotDe(ossoSel) ? M.original(ossoSel) : '';
  definirFerramenta(ferramenta, true);
  montarPainelAjuste();
  valoresSujos = true;
}
function definirFerramenta(f: 'girar' | 'mover', quieto = false) {
  if (f === 'mover' && ossoSel && !modoMover(ossoSel)) {
    if (!quieto) status(`${rotulo(ossoSel)} só gira (é a raiz do corpo ou não tem osso acima).`);
    return;
  }
  ferramenta = f;
  $('fGirar').classList.toggle('on', f === 'girar');
  $('fMover').classList.toggle('on', f === 'mover');
  prenderGizmo();
  rastroSujo = true;
  if (ossoSel) montarCorpo();
}
$('fGirar').onclick = () => definirFerramenta('girar');
$('fMover').onclick = () => definirFerramenta('mover');
function definirEscopo(e: typeof escopoSel) {
  escopoSel = e;
  for (const b of $('escopo').querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.e === e);
  if (e === 'trecho' && !linha.temLoop()) status('Marque o trecho arrastando na faixa de cima da linha do tempo.');
}
for (const b of $('escopo').querySelectorAll<HTMLElement>('button')) b.addEventListener('click', () => definirEscopo(b.dataset.e as typeof escopoSel));
$('raio').addEventListener('click', (e) => e.stopPropagation());
$('raio').addEventListener('focus', () => definirEscopo('momento'));
$('bEspaco').onclick = () => { cfg.espaco = cfg.espaco === 'local' ? 'mundo' : 'local'; salvarConfig(cfg); atualizarChips(); prenderGizmo(); };
$('bSnap').onclick = () => abrirConfig();
function atualizarChips() {
  $('bEspacoT').textContent = cfg.espaco === 'local' ? 'Local' : 'Mundo';
  $('bEspaco').classList.toggle('on', cfg.espaco === 'mundo');
  const s = [cfg.snapRot ? `${cfg.snapRot}°` : '', cfg.snapPos ? `${Math.round(cfg.snapPos * 100)} cm` : ''].filter(Boolean).join(' · ');
  $('bSnapT').textContent = s || 'Livre';
  $('bSnap').classList.toggle('on', !!s);
}

// clique: bolinha ou malha escolhe o osso; no vazio, desseleciona
const ray = new THREE.Raycaster();
let downXY: [number, number] | null = null;
function sob(e: MouseEvent): string | null {
  if (!M) return null;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  if (juntas.visible) {
    const h = ray.intersectObjects(marcadores, false);
    if (h.length) return h[0].object.userData.osso;
  }
  const hm = ray.intersectObjects(M.malhas, false);
  for (const h of hm) {
    const s = h.object as THREE.SkinnedMesh;
    const idx = s.geometry.getAttribute('skinIndex'), wt = s.geometry.getAttribute('skinWeight');
    if (!idx || !wt || !h.face) continue;
    const soma = new Map<number, number>();
    for (const v of [h.face.a, h.face.b, h.face.c]) for (let k = 0; k < 4; k++) {
      const w = wt.getComponent(v, k);
      if (w > 0) soma.set(idx.getComponent(v, k), (soma.get(idx.getComponent(v, k)) || 0) + w);
    }
    let melhor = -1, mw = 0;
    for (const [i, w] of soma) if (w > mw) { mw = w; melhor = i; }
    const b = s.skeleton.bones[melhor];
    if (b && M.bones[b.name]) return b.name;
  }
  return null;
}
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!editando || !downXY || e.button !== 0) return;
  if (Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5 || tc.dragging || tc.axis) return;
  escolherOsso(sob(e));
});
canvas.addEventListener('dblclick', (e) => { if (!editando || !sob(e)) enquadrar(); });
canvas.addEventListener('pointermove', (e) => {
  const et = $('etiqueta');
  if (!editando || tc.dragging || tc.axis || ver.limpo) { et.style.display = 'none'; return; }
  const n = sob(e);
  canvas.style.cursor = n ? 'pointer' : '';
  if (!n) { et.style.display = 'none'; return; }
  const r = canvas.getBoundingClientRect();
  et.textContent = rotulo(n);
  et.style.left = (e.clientX - r.left) + 'px';
  et.style.top = (e.clientY - r.top) + 'px';
  et.style.display = 'block';
});

// ---------------------------------------------------------------- edição: escreve na camada ativa (ou nas poses)
interface AlvoEd { osso: string; tipo: TipoEd; orig: { q: THREE.Quaternion; p: THREE.Vector3 }; chave?: ChaveEmEdicao; resolver?: ReturnType<typeof resolverCamada>; D?: { q: THREE.Quaternion; p: THREE.Vector3 } }
interface Edicao { a: Animacao; f: number; escopo: Escopo; poses: boolean; alvos: AlvoEd[]; inicio: Map<string, THREE.Quaternion>; mover?: ModoMover | null; modo: 'girar' | 'pos' | 'cadeia' | 'outro' }
let edicao: Edicao | null = null;
const raio = () => +($('raio') as HTMLInputElement).value || 6;
function escopoAtual(f: number): Escopo {
  if (escopoSel === 'tudo') return { tipo: 'tudo' };
  if (escopoSel === 'trecho') {
    if (linha.temLoop()) {
      const a = linha.loopA!, b = linha.loopB!, r = raio();
      if (f >= a && f <= b) return { tipo: 'trecho', a, b, raio: r };
      status('O quadro atual está fora do trecho marcado: valeu só em volta do quadro.');
    } else status('Sem trecho marcado (arraste na faixa de cima da linha do tempo): valeu só em volta do quadro.');
  }
  return { tipo: 'momento', raio: raio() };
}
function valorPose(p: PoseChave, osso: string): number[] {
  return p.v[osso] || (p.v[osso] = [0, 0, 0, 1]);
}
function comecarEdicao(tipos: Map<string, TipoEd[]>, escopoForcado?: Escopo, semDesfazer = false): boolean {
  if (!M || !atual || !tipos.size) return false;
  const a = atual;
  const f = quadroAtual();
  const poses = !!a.poses;
  const cam = camadaAtiva();
  if (!poses) {
    if (!cam) { status('A camada ativa é de exagero: escolha uma camada de ajuste pra mexer.', 'erro'); return false; }
    if (!cam.ligada || cam.peso < 0.01) { status('A camada ativa está desligada ou com peso 0: ligue ou escolha outra.', 'erro'); return false; }
  }
  if (verOriginal) { verOriginal = false; ($('cOriginal') as HTMLInputElement).checked = false; }
  if (!semDesfazer) guardarDesfazer();
  const escopo = poses ? { tipo: 'momento' as const, raio: 1 } : escopoForcado ?? escopoAtual(f);
  const ctx = ctxDe(a);
  if (poses && !a.poses!.some((p) => p.f === f)) {   // mexer fora de uma pose cria uma pose nova aqui
    const v: Record<string, number[]> = {};
    const base = a.poses![0];
    for (const o of Object.keys(base.v)) {
      const val = valorOriginal(a.clip, o, f / a.fps, M.repouso.get(o));
      v[o] = base.v[o].length > 4 ? [...val.q.toArray(), ...val.p.toArray()] : val.q.toArray();
    }
    const ant = [...a.poses!].reverse().find((p) => p.f < f);
    a.poses!.push({ f, i: ant?.i ?? cfg.interp, v });
    a.poses!.sort((x, y) => x.f - y.f);
  }
  const alvos: AlvoEd[] = [];
  const inicio = new Map<string, THREE.Quaternion>();
  for (const [osso, ts] of tipos) {
    const b = M.bones[osso];
    if (!b) continue;
    inicio.set(osso, b.quaternion.clone());
    const orig = valorOriginal(a.clip, osso, f / a.fps, M.repouso.get(osso));
    for (const t of ts) {
      const al: AlvoEd = { osso, tipo: t, orig };
      if (poses) al.D = deltaCamadas(a.camadas, ctx, osso, f);
      else {
        al.resolver = resolverCamada(a.camadas, a.ativa, ctx, osso, f);
        al.chave = prepararChave(cam!.ajustes, osso, t, f, escopo, quadros(), cfg.interp || undefined);
      }
      alvos.push(al);
    }
  }
  edicao = { a, f, escopo, poses, alvos, inicio, modo: 'outro' };
  return true;
}
function escreverEdicao(valores: Map<string, { q?: THREE.Quaternion; p?: THREE.Vector3 }>) {
  for (const v of valores.values()) {
    if ((v.q && !Number.isFinite(v.q.x + v.q.y + v.q.z + v.q.w)) || (v.p && !Number.isFinite(v.p.x + v.p.y + v.p.z))) { status('Esse movimento deu um valor inválido; ignorei.'); return; }
  }
  const e = edicao;
  if (!e || !M) return;
  const pose = e.poses ? e.a.poses!.find((p) => p.f === e.f) : undefined;
  for (const al of e.alvos) {
    const v = valores.get(al.osso);
    if (!v) continue;
    if (al.tipo === 'rot' && v.q) {
      if (pose) {
        const q = v.q.clone().multiply(al.D!.q.clone().invert());
        const arr = valorPose(pose, al.osso);
        arr.splice(0, 4, q.x, q.y, q.z, q.w);
      } else escreverChave(al.chave!, al.resolver!.rot(al.orig.q, v.q), e.f);
    }
    if (al.tipo === 'pos' && v.p) {
      if (pose) {
        const p = v.p.clone().sub(al.D!.p);
        const arr = valorPose(pose, al.osso);
        arr.splice(4, 3, p.x, p.y, p.z);
      } else escreverChave(al.chave!, al.resolver!.pos(al.orig.p, v.p), e.f);
    }
  }
  if (e.poses) {
    atualizarTrilhas(e.a.clip, e.a.poses!, [...new Set(e.alvos.map((x) => x.osso))], e.a.fps);
    esquecerClipe(e.a.clip);
  }
  rastroSujo = true;
  valoresSujos = true;
}
function terminarEdicao() {
  const e = edicao;
  if (!e) return;
  edicao = null;
  if (e.poses) trocarClipe(e.a, gerarClipePoses(e.a.nome, e.a.clip.duration, e.a.fps, e.a.poses!));
  mudou();
}

// gizmo
function gizmoComecou() {
  if (ajustandoAcessorio) return;
  if (!ossoSel || !atual || !M) return;
  if (ferramenta === 'girar') {
    if (comecarEdicao(new Map([[ossoSel, ['rot']]]))) edicao!.modo = 'girar';
    return;
  }
  const m = modoMover(ossoSel);
  if (m?.tipo === 'quadril') { if (comecarEdicao(new Map([[ossoSel, ['pos']]]))) edicao!.modo = 'pos'; }
  else if (m?.tipo === 'cadeia') {
    if (comecarEdicao(new Map(m.girados.map((n) => [n, ['rot'] as TipoEd[]])))) { edicao!.modo = 'cadeia'; edicao!.mover = m; }
  }
}
function gizmoMudou() {
  if (ajustandoAcessorio) { lerTransformAcessorio(ajustandoAcessorio); return; }
  const e = edicao;
  if (!e || !M || !ossoSel) return;
  const B = M.bones;
  if (e.modo === 'girar') escreverEdicao(new Map([[ossoSel, { q: B[ossoSel].quaternion.clone() }]]));
  else if (e.modo === 'pos') escreverEdicao(new Map([[ossoSel, { p: B[ossoSel].position.clone() }]]));
  else if (e.modo === 'cadeia' && e.mover?.tipo === 'cadeia') {
    for (const [n, q] of e.inicio) B[n].quaternion.copy(q);
    M.root.updateMatrixWorld(true);
    e.mover.resolver(alvoIK.getWorldPosition(_v()));
    escreverEdicao(new Map(e.mover.girados.map((n) => [n, { q: B[n].quaternion.clone() }])));
  }
}
function gizmoSoltou() {
  if (ajustandoAcessorio) { guardarAgora(); return; }
  terminarEdicao();
}
tc.addEventListener('mouseDown', gizmoComecou);
tc.addEventListener('objectChange', gizmoMudou);
tc.addEventListener('mouseUp', gizmoSoltou);

// ---------------------------------------------------------------- valores (números) e interpolação
let valoresSujos = true, painelSujo = true;
let eulerIni: THREE.Euler | null = null, posIni: THREE.Vector3 | null = null;
const EIXOS = ['X', 'Y', 'Z'] as const;
const corEixo = (i: number) => cor((['vermelho', 'verde', 'azul'] as const)[i]);
const camposRot = EIXOS.map((nome, i) => new CampoNumero({
  rotulo: nome, titulo: `Rotação em ${nome} (graus, a partir da pose de repouso). Arraste no nome ou digite.`, passo: 0.5, casas: 1, sufixo: '°', cor: corEixo(i),
  comecar: () => {
    if (!ossoSel || !M || edicao) return false;
    if (tocando) definirTocando(false);
    eulerIni = new THREE.Euler().setFromQuaternion(M.repouso.get(ossoSel)!.q.clone().invert().multiply(M.bones[ossoSel].quaternion), 'XYZ');
    return comecarEdicao(new Map([[ossoSel, ['rot']]]));
  },
  mudar: (v) => {
    if (!edicao || !ossoSel || !eulerIni) return;
    const e = eulerIni.clone();
    (e as unknown as Record<string, number>)[nome.toLowerCase()] = v * RAD;
    const q = M!.repouso.get(ossoSel)!.q.clone().multiply(new THREE.Quaternion().setFromEuler(e));
    escreverEdicao(new Map([[ossoSel, { q }]]));
  },
  terminar: () => { eulerIni = null; terminarEdicao(); },
}));
const camposPos = EIXOS.map((nome, i) => new CampoNumero({
  rotulo: nome, titulo: `Posição em ${nome} (metros, a partir do repouso, no espaço do osso de cima)`, passo: 0.002, casas: 3, sufixo: ' m', cor: corEixo(i),
  comecar: () => {
    if (!ossoSel || !M || edicao || !temPosicao(ossoSel)) return false;
    if (tocando) definirTocando(false);
    posIni = M.bones[ossoSel].position.clone().sub(M.repouso.get(ossoSel)!.p);
    return comecarEdicao(new Map([[ossoSel, ['pos']]]));
  },
  mudar: (v) => {
    if (!edicao || !ossoSel || !posIni) return;
    const d = posIni.clone();
    d.setComponent(i, v);
    escreverEdicao(new Map([[ossoSel, { p: M!.repouso.get(ossoSel)!.p.clone().add(d) }]]));
  },
  terminar: () => { posIni = null; terminarEdicao(); },
}));
{
  const r = $('camposRot'), p = $('camposPos');
  r.innerHTML = '<div class="titulo-campos">Rotação</div>';
  p.innerHTML = '<div class="titulo-campos">Posição</div>';
  camposRot.forEach((c) => r.appendChild(c.el));
  camposPos.forEach((c) => p.appendChild(c.el));
}
const temPosicao = (osso: string) => !!atual && (osso === mapa.quadril || !!trilha(atual.clip, osso, 'position'));
function atualizarValores() {
  valoresSujos = false;
  const tem = !!ossoSel && !!M && !!atual;
  camposRot.forEach((c) => c.habilitar(tem));
  const pos = tem && temPosicao(ossoSel!);
  $('camposPos').hidden = !pos;
  if (tem) {
    const b = M!.bones[ossoSel!], rep = M!.repouso.get(ossoSel!)!;
    const e = new THREE.Euler().setFromQuaternion(rep.q.clone().invert().multiply(b.quaternion), 'XYZ');
    camposRot[0].definir(e.x / RAD); camposRot[1].definir(e.y / RAD); camposRot[2].definir(e.z / RAD);
    if (pos) { const d = b.position.clone().sub(rep.p); camposPos.forEach((c, i) => c.definir(d.getComponent(i))); }
  }
  const sel = $<HTMLSelectElement>('selInterp');
  const q = quadroAtual();
  const i = atual?.poses ? atual.poses.find((p) => p.f === q)?.i : interpNoQuadro(ajAtual(), ossosDaLinha(), q);
  if (document.activeElement !== sel) sel.value = String(i ?? cfg.interp);
  sel.title = i !== undefined ? 'Interpolação da chave deste quadro até a próxima' : `Sem chave neste quadro: as chaves novas usam "${NOME_INTERP[cfg.interp]}"`;
  sel.classList.toggle('mut', i === undefined);
}
$('selInterp').onchange = () => {
  const v = +($('selInterp') as HTMLSelectElement).value;
  if (!atual) return;
  const q = quadroAtual();
  if (atual.poses) {
    const p = atual.poses.find((x) => x.f === q);
    if (p) {
      guardarDesfazer();
      p.i = v;
      trocarClipe(atual, gerarClipePoses(atual.nome, atual.clip.duration, atual.fps, atual.poses));
      mudou();
      status(`Pose do quadro ${q}: ${NOME_INTERP[v]}.`, 'ok');
      return;
    }
  } else {
    const ossos = ossosEmEdicao().length ? ossosEmEdicao() : Object.keys(ajAtual());
    guardarDesfazer();
    if (definirInterp(ajAtual(), ossos, q, v)) { mudou(); status(`Chave do quadro ${q}: ${NOME_INTERP[v]}.`, 'ok'); return; }
    desfazer.pop();
  }
  cfg.interp = v;
  salvarConfig(cfg);
  status(`Sem chave neste quadro: as chaves novas vão usar "${NOME_INTERP[v]}".`);
  valoresSujos = true;
};

// ---------------------------------------------------------------- painel de ajuste: silhueta, árvore, camadas, poses
const arvore = new Arvore($('arvore'), $<HTMLInputElement>('buscaOsso'), (n) => escolherOsso(n));
$('buscaOsso').addEventListener('input', () => { ($('arvoreBox') as HTMLDetailsElement).open = true; });
function montarCorpo() {
  if (!M) { $('silhueta').innerHTML = ''; return; }
  const aj = ossosAjustados();
  const nMapa = Object.keys(mapa).length;
  $('silhueta').hidden = nMapa < 5;
  if (nMapa < 5) ($('arvoreBox') as HTMLDetailsElement).open = true;
  desenharSilhueta($('silhueta'), { mapa, sel: ossoSel, emEdicao: new Set(ossosEmEdicao()), ajustados: aj, nomeOsso: M.original }, escolherOsso, abrirMapa);
  const slotCurto = new Map<string, string>();
  for (const s of Object.keys(mapa) as Slot[]) slotCurto.set(mapa[s]!, nomeSlot(s).replace(' esquerd', ' esq.').replace(/a\.$|o\.$/, '.').replace(' direit', ' dir.').replace(/(esq|dir)\.[ao]$/, '$1.'));
  $('nOssos').textContent = `(${M.listaOssos.length})`;
  arvore.desenhar({
    nos: M.listaOssos.map((n) => { const b = M!.bones[n]; return { nome: n, rotulo: M!.original(n), extra: slotCurto.get(n), pai: ehOsso(b.parent) ? b.parent.name : null }; }),
    sel: ossoSel, ajustados: aj,
  });
}
function montarPainelAjuste() {
  if (!editando) return;
  montarCorpo();
  montarCamadas();
  montarBiblioteca();
  const s = ossoSel ? (mapa.quadril === ossoSel ? undefined : undefined) : undefined;
  void s;
  const ex = camadaExagero();
  const chave = exAlvo === 'corpo' ? '*' : ossoSel;
  const k = ex && chave ? ex.fatores[chave] ?? 1 : 1;
  ($('exFator') as HTMLInputElement).value = String(Math.round(k * 100));
  $('exFatorV').textContent = `${Math.round(k * 100)}%`;
  valoresSujos = true;
}
function montarCamadas() {
  const el = $('camadas');
  el.innerHTML = '';
  if (!atual) return;
  $('nCamadas').textContent = atual.camadas.length > 1 ? `(${atual.camadas.length})` : '';
  if (atual.poses) {
    const d = document.createElement('div');
    d.className = 'mut';
    d.textContent = 'Pose a pose: mexer edita as poses. As camadas valem por cima.';
    el.appendChild(d);
  }
  atual.camadas.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'camada' + (i === atual!.ativa ? ' ativa' : '') + (c.ligada ? '' : ' desligada');
    row.title = c.tipo === 'exagero' ? 'Camada de exagero (o controle "Quanto" do Movimento mexe nela)' : 'Clique pra mexer nesta camada';
    row.innerHTML = `<input type="checkbox" ${c.ligada ? 'checked' : ''} title="Liga/desliga a camada">
      <span class="nome">${esc(c.nome)}</span><span class="tipo">${c.tipo === 'exagero' ? 'exagero' : ''}</span>
      <button class="mini" title="Apagar a camada">${ICONES.lixo}</button>
      <span></span><div class="peso"><input type="range" min="0" max="100" step="1" value="${Math.round(c.peso * 100)}" title="Peso da camada"><span class="val">${Math.round(c.peso * 100)}%</span></div>`;
    const chk = row.querySelector('input[type=checkbox]') as HTMLInputElement;
    const rng = row.querySelector('input[type=range]') as HTMLInputElement;
    chk.onclick = (e) => { e.stopPropagation(); guardarDesfazer(); c.ligada = chk.checked; mudou(); };
    let mexendo = false;
    rng.onpointerdown = (e) => { e.stopPropagation(); if (!mexendo) { guardarDesfazer(); mexendo = true; } };
    rng.oninput = () => { c.peso = +rng.value / 100; (row.querySelector('.val') as HTMLElement).textContent = `${rng.value}%`; rastroSujo = true; };
    rng.onchange = () => { mexendo = false; mudou(); };
    rng.onclick = (e) => e.stopPropagation();
    row.querySelector('.mini')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tem = c.tipo === 'ajuste' ? Object.keys(c.ajustes).length : Object.keys(c.fatores).length;
      if (tem && !(await confirmar('Apagar a camada?', `"${c.nome}" e tudo o que tem nela saem desta animação. Dá pra desfazer (Ctrl+Z).`, 'Apagar camada', true))) return;
      guardarDesfazer();
      atual!.camadas.splice(i, 1);
      if (!atual!.camadas.length) atual!.camadas.push(novaCamada(novoId(), 'Ajustes'));
      atual!.ativa = Math.min(atual!.ativa >= i ? Math.max(0, atual!.ativa - 1) : atual!.ativa, atual!.camadas.length - 1);
      mudou();
    });
    row.querySelector('.nome')!.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const sp = e.target as HTMLElement;
      const inp = Object.assign(document.createElement('input'), { className: 'renomear', value: c.nome });
      inp.style.cssText = 'width:100%;background:var(--bg);color:var(--txt);border:1px solid var(--acc);border-radius:4px;padding:1px 5px';
      sp.replaceWith(inp); inp.focus(); inp.select();
      const fim = (ok: boolean) => { if (ok && inp.value.trim() && inp.value.trim() !== c.nome) { guardarDesfazer(); c.nome = inp.value.trim(); mudou(); } else montarCamadas(); };
      inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') fim(true); if (ev.key === 'Escape') fim(false); };
      inp.onblur = () => fim(true);
    });
    row.addEventListener('click', () => { if (atual!.ativa !== i) { atual!.ativa = i; mudou(false); } });
    el.appendChild(row);
  });
}
$('bNovaCamada').onclick = () => {
  if (!atual) return;
  guardarDesfazer();
  atual.camadas.push(novaCamada(novoId(), `Camada ${atual.camadas.length + 1}`));
  atual.ativa = atual.camadas.length - 1;
  ($('secCamadas') as HTMLDetailsElement).open = true;
  mudou();
};
function camadaExagero(criar = false): CamadaExagero | null {
  if (!atual) return null;
  let c = atual.camadas.find((x) => x.tipo === 'exagero') as CamadaExagero | undefined;
  if (!c && criar) {
    c = { id: novoId(), nome: 'Exagero', peso: 1, ligada: true, tipo: 'exagero', fatores: {} };
    atual.camadas.push(c);
  }
  return c ?? null;
}

// ---------------------------------------------------------------- movimento: exagerar
let exAlvo: 'osso' | 'corpo' = 'osso';
for (const b of $('exAlvo').querySelectorAll<HTMLElement>('button')) b.onclick = () => {
  exAlvo = b.dataset.a as typeof exAlvo;
  for (const x of $('exAlvo').querySelectorAll('button')) x.classList.toggle('on', x === b);
  montarPainelAjuste();
};
let exMexendo = false;
function exagerar(alvo: 'osso' | 'corpo', fator: number, fim = true) {
  if (!atual) return false;
  const chave = alvo === 'corpo' ? '*' : ossoSel;
  if (!chave) { status('Escolha um osso (ou "Corpo todo").'); return false; }
  if (!exMexendo) { guardarDesfazer(); exMexendo = true; }
  const c = camadaExagero(true)!;
  c.fatores[chave] = fator;
  if (alvo === 'osso') for (const o of ossosEmEdicao()) if (o !== chave && ferramenta === 'mover') c.fatores[o] = fator;
  rastroSujo = true;
  $('exFatorV').textContent = `${Math.round(fator * 100)}%`;
  if (fim) { exMexendo = false; mudou(); }
  return true;
}
$('exFator').oninput = () => exagerar(exAlvo, +($('exFator') as HTMLInputElement).value / 100, false);
$('exFator').onchange = () => exagerar(exAlvo, +($('exFator') as HTMLInputElement).value / 100, true);

// ---------------------------------------------------------------- movimento: espelhar
function poseNaTela(): Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }> {
  const r = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  if (!M) return r;
  avaliarEm(quadroAtual());
  for (const n of M.listaOssos) r.set(n, { q: M.bones[n].quaternion.clone(), p: M.bones[n].position.clone() });
  return r;
}
function aplicarPose(alvo: Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>, msg: string, so?: Set<string>) {
  if (!M || !atual) return false;
  const agora = poseNaTela();
  const tipos = new Map<string, TipoEd[]>();
  const valores = new Map<string, { q?: THREE.Quaternion; p?: THREE.Vector3 }>();
  for (const [n, v] of alvo) {
    if (so && !so.has(n)) continue;
    const at = agora.get(n);
    if (!at) continue;
    const t: TipoEd[] = [];
    if (anguloQuat(at.q, v.q) > 0.005) t.push('rot');
    if (temPosicao(n) && at.p.distanceTo(v.p) > ALTURA * 1e-5) t.push('pos');
    if (t.length) { tipos.set(n, t); valores.set(n, { q: v.q, p: v.p }); }
  }
  if (!tipos.size) { status('Esse quadro já tem essa pose.'); return false; }
  if (!comecarEdicao(tipos)) return false;
  escreverEdicao(valores);
  terminarEdicao();
  status(msg, 'ok');
  return true;
}
function espelharPose() {
  if (!M || !atual) return;
  const agora = poseNaTela();
  const alvo = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const t of M.listaOssos) {
    const s = M.pares.get(t) ?? t;
    const src = agora.get(s)!, rs = M.bind.get(s)!, rt = M.bind.get(t)!;
    const d = rs.q.clone().invert().multiply(src.q);
    const q = rt.q.clone().multiply(mapaRot(M.rw.get(s)!, M.rw.get(t)!)(d));
    const p = rt.p.clone().add(mapaVet(M.rwPai.get(s)!, M.rwPai.get(t)!)(src.p.clone().sub(rs.p)));
    alvo.set(t, { q, p });
  }
  aplicarPose(alvo, `Pose espelhada no quadro ${quadroAtual()}.`);
}
function espelharAjuste(meioCiclo: boolean) {
  const cam = camadaAtiva();
  if (!M || !atual || !cam) return;
  if (atual.poses) { status('Em pose a pose, use "Pose espelhada".'); return; }
  const ossos = (ossosEmEdicao().length ? ossosEmEdicao() : Object.keys(cam.ajustes)).filter((o) => cam.ajustes[o]);
  if (!ossos.length) { status('Esse osso não tem ajuste nesta camada pra copiar.'); return; }
  guardarDesfazer();
  const n = quadros(), h = Math.round(n / 2);
  let feitos = 0;
  const nomes: string[] = [];
  for (const o of ossos) {
    const t = M.pares.get(o);
    if (!t || t === o) continue;
    const src = cam.ajustes[o];
    const mr = mapaRot(M.rw.get(o)!, M.rw.get(t)!), mv = mapaVet(M.rwPai.get(o)!, M.rwPai.get(t)!);
    const novo: AjusteOsso = {};
    const desloca = <K extends ChaveRot | ChavePos>(L: K[], val: (f: number) => K, iInterp: number): K[] => {
      if (!meioCiclo) return L;
      const r = new Map<number, K>();
      for (const k of L) { if (k[0] >= n && L.some((x) => x[0] === 0)) continue; const f = (k[0] + h) % n; const c = k.slice() as K; c[0] = f; r.set(f, c); }
      // o trecho da origem que atravessa o fim do loop: uma chave por quadro (linear), pra seguir a curva da origem
      const s = n - h;
      const ka = [...L].reverse().find((k) => k[0] < s), kb = L.find((k) => k[0] > s);
      const dens = new Set<number>([0, n]);
      if (ka && kb) { for (let t = ka[0] + h; t <= n; t++) dens.add(t); for (let t = 0; t <= kb[0] + h - n; t++) dens.add(t); }
      for (const t of dens) { const c = val(t); if (ka && kb) (c as number[])[iInterp] = 1; r.set(t, c); }
      return [...r.values()].sort((a, b) => a[0] - b[0]);
    };
    if (src.rot) {
      const conv = (q: THREE.Quaternion, f: number, i?: number) => qArr(f, mr(q), i);
      const base = src.rot.map((k) => conv(new THREE.Quaternion(k[1], k[2], k[3], k[4]), k[0], k[5]));
      novo.rot = desloca(base, (f) => conv(evalRot(src.rot, ((f - h) % n + n) % n), f), 5);
    }
    if (src.pos) {
      const conv = (p: THREE.Vector3, f: number, i?: number) => pArr(f, mv(p), i);
      const base = src.pos.map((k) => conv(new THREE.Vector3(k[1], k[2], k[3]), k[0], k[4]));
      novo.pos = desloca(base, (f) => conv(evalPos(src.pos, ((f - h) % n + n) % n), f), 4);
    }
    cam.ajustes[t] = novo;
    feitos++;
    nomes.push(rotulo(t));
  }
  if (!feitos) { desfazer.pop(); status('Esse osso fica no meio do corpo: não tem outro lado.'); return; }
  mudou();
  status(`Copiado pra ${nomes.join(', ')}${meioCiclo ? `, meio ciclo depois (${h} quadros)` : ''}.`, 'ok');
}
$('bEspPose').onclick = espelharPose;
$('bEspAjuste').onclick = () => espelharAjuste(false);
$('bEspCiclo').onclick = () => espelharAjuste(true);

// ---------------------------------------------------------------- movimento: pé no chão, emendar loop
function frenteDoModelo() { return new THREE.Vector3(0, 0, 1).applyQuaternion(M!.root.getWorldQuaternion(new THREE.Quaternion())); }
function velEsteira() { return ($('cEsteira') as HTMLInputElement).checked ? parseFloat(($('esteiraV') as HTMLInputElement).value) || 0 : 0; }
function grudarPe() {
  if (!M || !atual || !acaoAtual) return null;
  if (atual.poses) { status('Em pose a pose, ajuste as poses direto.'); return null; }
  const slot = ossoSel ? slotDe(ossoSel) : undefined;
  const lado = slot?.split('.')[1];
  const ehBraco = !!slot && ['mao', 'antebraco', 'braco'].includes(slot.split('.')[0]);
  const c = lado ? cadeiaDe(`${ehBraco ? 'mao' : 'pe'}.${lado}` as Slot) : null;
  // rig de IK (o pé não é filho da perna, mas tem posição própria): prende pela posição do próprio osso
  const solto = !c && !!ossoSel && temPosicao(ossoSel) ? ossoSel : null;
  if (!c && !solto) { status('Escolha um pé (ou uma mão) com a perna/braço no mapa do corpo.', 'erro'); return null; }
  const ponta = c ? c[2] : solto!;
  const n = quadros(), f0 = quadroAtual(), fps = atual.fps;
  const B = M.bones;
  const v = velEsteira(), frente = frenteDoModelo();
  const pos: THREE.Vector3[] = [];
  for (let f = 0; f <= n; f++) { avaliarEm(f); pos.push(B[ponta].getWorldPosition(_v())); }
  let a: number, b: number;
  if (linha.temLoop() && f0 >= linha.loopA! && f0 <= linha.loopB!) { a = linha.loopA!; b = linha.loopB!; }
  else {
    const ymin = Math.min(...pos.map((p) => p.y));
    const vel = (f: number) => {
      const p0 = pos[Math.max(0, f - 1)], p1 = pos[Math.min(n, f + 1)];
      const d = p1.clone().sub(p0).multiplyScalar(fps / Math.max(1, Math.min(n, f + 1) - Math.max(0, f - 1))).addScaledVector(frente, v);
      d.y = 0;
      return d.length();
    };
    const ymax = Math.max(...pos.map((p) => p.y));
    const contato = (f: number) => pos[f].y < ymin + Math.min(ALTURA * 0.025, (ymax - ymin) * 0.2) && vel(f) < ALTURA * 0.6;
    if (!contato(f0)) { avaliarEm(f0); status('Neste quadro o pé não está no chão. Vá pra uma pisada ou marque o trecho na régua.', 'erro'); return null; }
    a = f0; b = f0;
    while (a > 0 && contato(a - 1)) a--;
    while (b < n && contato(b + 1)) b++;
  }
  guardarDesfazer();
  const nomeLado = lado === 'L' ? 'esq.' : 'dir.';
  const cam = novaCamada(novoId(), `${ehBraco ? 'Mão' : 'Pé'} preso (${nomeLado} ${a}–${b})`);
  cam.ligada = false;
  atual.camadas.push(cam);
  const idx = atual.camadas.length - 1;
  const P0 = pos[f0].clone();
  const r = Math.min(4, Math.max(1, raio()));
  const esc: Escopo = { tipo: 'trecho', a, b, raio: r };
  const alvoEm = (f: number) => P0.clone().addScaledVector(frente, -v * (f - f0) / fps);
  const res: [number, Map<string, THREE.Quaternion>][] = [];
  const resPos: [number, THREE.Vector3][] = [];
  for (let f = Math.max(0, a - r); f <= Math.min(n, b + r); f++) {
    const w = pesoEscopo(esc, f);
    avaliarEm(f);
    const alvo = pos[f].clone().lerp(alvoEm(f), w);
    if (c) {
      if (w > 0) resolverIK(B[c[0]], B[c[1]], B[c[2]], alvo, poleReserva(c));
      res.push([f, new Map(c.map((o) => [o, B[o].quaternion.clone()]))]);
    } else resPos.push([f, B[ponta].parent!.worldToLocal(alvo.clone())]);
  }
  const ctx = ctxDe(atual);
  if (!c) {
    const L: ChavePos[] = resPos.map(([f, p]) => pArr(f, resolverCamada(atual!.camadas, idx, ctx, ponta, f).pos(valorOriginal(atual!.clip, ponta, f / fps, M!.repouso.get(ponta)).p, p), 1));
    cam.ajustes[ponta] = { pos: L };
  }
  for (const o of c || []) {
    const L: ChaveRot[] = [];
    for (const [f, m] of res) {
      const orig = valorOriginal(atual.clip, o, f / fps, M.repouso.get(o));
      L.push(qArr(f, resolverCamada(atual.camadas, idx, ctx, o, f).rot(orig.q, m.get(o)!), 1));
    }
    cam.ajustes[o] = { rot: L };
  }
  cam.ligada = true;
  let erro = 0;
  for (let f = a; f <= b; f++) { avaliarEm(f); erro = Math.max(erro, B[ponta].getWorldPosition(_v()).distanceTo(alvoEm(f))); }
  avaliarEm(f0);
  mudou();
  ($('secCamadas') as HTMLDetailsElement).open = true;
  const longe = erro > ALTURA * 0.005;
  status(`${ehBraco ? 'Mão presa' : 'Pé preso'} do quadro ${a} ao ${b} (camada nova).` + (longe ? ` Em alguns quadros a ${ehBraco ? 'mão' : 'perna'} não alcança (fica esticada): sobra ${fmt(erro / ALTURA * 100, 1)}% da altura.` : ''), longe ? '' : 'ok', 5000);
  return { a, b, erro };
}
$('bPe').onclick = () => grudarPe();
function emendarLoop() {
  if (!M || !atual || !acaoAtual) return null;
  if (atual.poses) { status('Em pose a pose: copie a pose do quadro 0 e cole no último.'); return null; }
  const n = quadros();
  if (n < 4) { status('Animação curta demais pra emendar.'); return null; }
  const fps = atual.fps;
  const R = Math.max(2, Math.min(raio(), Math.floor(n / 3)));
  const f0 = quadroAtual();
  const ini = poseEmQuadro(0), fim = poseEmQuadro(n);
  let antes = 0, onde = '';
  for (const o of M.listaOssos) { const g = anguloQuat(ini.get(o)!.q, fim.get(o)!.q); if (g > antes) { antes = g; onde = rotulo(o); } }
  if (antes < 0.05) { avaliarEm(f0); status('O loop já emenda (pulo menor que 0,05°).'); return { antes, depois: antes }; }
  guardarDesfazer();
  const cam = novaCamada(novoId(), 'Emenda do loop');
  atual.camadas.push(cam);
  const idx = atual.camadas.length - 1;
  const ctx = ctxDe(atual);
  for (const o of M.listaOssos) {
    const qa = ini.get(o)!.q, qb = fim.get(o)!.q, pa = ini.get(o)!.p, pb = fim.get(o)!.p;
    const ad: AjusteOsso = {};
    if (anguloQuat(qa, qb) > 0.02) {
      const m = qa.clone().slerp(qb, 0.5);
      const o0 = valorOriginal(atual.clip, o, 0, M.repouso.get(o)), on = valorOriginal(atual.clip, o, n / fps, M.repouso.get(o));
      const L0 = resolverCamada(atual.camadas, idx, ctx, o, 0).rot(o0.q, m), Ln = resolverCamada(atual.camadas, idx, ctx, o, n).rot(on.q, m);
      ad.rot = [qArr(0, L0), qArr(R, QI), qArr(n - R, QI), qArr(n, Ln)];
    }
    if (temPosicao(o)) {
      const d = pb.clone().sub(pa);
      const hz = Math.hypot(d.x, d.z);
      if (hz > ALTURA * 0.05) { d.x = 0; d.z = 0; }      // andar pra frente (root motion) não é pulo: só o vertical
      if (d.length() > ALTURA * 1e-4) {
        const o0 = valorOriginal(atual.clip, o, 0, M.repouso.get(o)), on = valorOriginal(atual.clip, o, n / fps, M.repouso.get(o));
        const P0 = resolverCamada(atual.camadas, idx, ctx, o, 0).pos(o0.p, pa.clone().addScaledVector(d, 0.5));
        const Pn = resolverCamada(atual.camadas, idx, ctx, o, n).pos(on.p, pb.clone().addScaledVector(d, -0.5));
        const Z = new THREE.Vector3();
        ad.pos = [pArr(0, P0), pArr(R, Z), pArr(n - R, Z), pArr(n, Pn)];
      }
    }
    if (ad.rot || ad.pos) cam.ajustes[o] = ad;
  }
  const i2 = poseEmQuadro(0), f2 = poseEmQuadro(n);
  let depois = 0;
  for (const o of M.listaOssos) depois = Math.max(depois, anguloQuat(i2.get(o)!.q, f2.get(o)!.q));
  avaliarEm(f0);
  mudou();
  status(`Loop emendado: o maior pulo era ${fmt(antes, 1)}° (${onde}); agora ${fmt(depois, 2)}°.`, 'ok', 4500);
  return { antes, depois, onde };
}
function poseEmQuadro(f: number) {
  avaliarEm(f);
  const r = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const n of M!.listaOssos) r.set(n, { q: M!.bones[n].quaternion.clone(), p: M!.bones[n].position.clone() });
  return r;
}
$('bLoopEmenda').onclick = () => emendarLoop();

// ---------------------------------------------------------------- tempo: esticar trecho; pose a pose
async function esticarTrecho(fator?: number) {
  if (!atual) return;
  if (!linha.temLoop()) { status('Marque o trecho arrastando na faixa de cima da linha do tempo.'); return; }
  const a = linha.loopA!, b = linha.loopB!;
  if (fator === undefined) {
    const { botao, form } = await abrirDialogo(`<h3>Esticar o trecho ${a}–${b}</h3>
      <p>Mais de 100% deixa o trecho mais lento (mais quadros); menos deixa mais rápido. O resto da animação só anda junto.</p>
      <label class="campo"><span>Tamanho novo (%)</span><input type="number" name="k" value="150" min="10" max="1000" step="5" autofocus></label>
      <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">Esticar</button></div>`);
    if (botao !== 'ok') return;
    fator = (Number(new FormData(form).get('k')) || 100) / 100;
  }
  if (Math.abs(fator - 1) < 1e-3) return;
  const fps = atual.fps;
  const g = remapaTrecho(a / fps, b / fps, fator);
  retimeAnim(atual, g, g(atual.clip.duration), [a / fps, b / fps]);
  linha.definirLoop(a, Math.round(a + (b - a) * fator));
  status(`Trecho ${a}–${b} agora vai de ${a} a ${linha.loopB} (${Math.round(fator * 100)}%).`, 'ok');
}
$('bEsticar').onclick = () => esticarTrecho();
async function poseAPose(qtd?: number, interp?: number) {
  if (!M || !atual) return null;
  if (atual.poses) { status('Esta já é pose a pose.'); return null; }
  const a = atual, n = quadros();
  const ossos = new Set<string>();
  for (const t of a.clip.tracks) ossos.add(t.name.slice(0, t.name.lastIndexOf('.')));
  for (const c of a.camadas) for (const o of ossosDaCamada(c, a.clip)) ossos.add(o);
  const comPos = new Set([...ossos].filter((o) => o === mapa.quadril || trilha(a.clip, o, 'position') || a.camadas.some((c) => c.tipo === 'ajuste' && c.ajustes[o]?.pos)));
  const amostra = (f: number) => {
    const m = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
    for (const o of ossos) if (M!.bones[o]) m.set(o, valorAjustado(a.clip, a.camadas, o, Math.min(a.clip.duration, f / a.fps), a.fps, M!.repouso.get(o), M!.repouso));
    return m;
  };
  if (qtd === undefined) {
    const sug = detectarPoses(amostra, n, Math.min(24, n + 1), 3).length;
    const { botao, form } = await abrirDialogo(`<h3>Pose a pose</h3>
      <p>Cria a cópia "${esc(a.nome)} (poses)" só com as poses-chave. Mexeu numa pose, o movimento até as vizinhas acompanha. A original fica como está.</p>
      <label class="campo"><span>Quantas poses (sugestão pra esta animação: ${sug})</span><input type="number" name="k" value="${sug}" min="2" max="${n + 1}" autofocus></label>
      <label class="campo"><span>Interpolação entre as poses</span><select name="i">${NOME_INTERP.map((x, i) => `<option value="${i}"${i === cfg.interp ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">Criar</button></div>`);
    if (botao !== 'ok') return null;
    const fd = new FormData(form);
    qtd = Math.max(2, Math.min(n + 1, Number(fd.get('k')) || sug));
    interp = Number(fd.get('i')) || 0;
  }
  const fs = detectarPoses(amostra, n, qtd, 0);
  const poses: PoseChave[] = fs.map((f) => {
    const m = amostra(f);
    const v: Record<string, number[]> = {};
    for (const [o, x] of m) v[o] = comPos.has(o) ? [...x.q.toArray(), ...x.p.toArray()] : x.q.toArray();
    return { f, i: interp ?? 0, v };
  });
  guardarDesfazer();
  const nome = nomeLivre(a.nome + ' (poses)');
  const nova: Animacao = { id: novoId(), nome, clip: gerarClipePoses(nome, a.clip.duration, a.fps, poses), camadas: camadasPadrao(), ativa: 0, fps: a.fps, poses, nova: true };
  anims.splice(anims.indexOf(a) + 1, 0, nova);
  tocar(nova.id);
  if (!editando) entrarEdicao(true);
  mudou();
  status(`"${nome}": ${poses.length} poses (quadros ${fs.join(', ')}). Mexa numa pose; o resto acompanha.`, 'ok', 5000);
  return nova;
}
$('bPoseAPose').onclick = () => poseAPose();

// ---------------------------------------------------------------- copiar / colar pose, biblioteca
let poseCopiada: Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }> | null = null;
function copiarPose() {
  if (!M) return;
  poseCopiada = poseNaTela();
  status(`Pose do quadro ${quadroAtual()} copiada.`, 'ok');
}
function colarPose() {
  if (!poseCopiada) { status('Copie uma pose primeiro (Ctrl+C).'); return; }
  aplicarPose(poseCopiada, `Pose colada no quadro ${quadroAtual()}.`);
}
$('bCopiar').onclick = copiarPose;
$('bColar').onclick = colarPose;
function miniatura(): string {
  if (!canvas.width || !canvas.height) return '';     // tela escondida: guarda sem miniatura
  const vis = [juntas.visible, tcHelper.visible, rastroLinha.visible, rastroPontos.visible];
  juntas.visible = tcHelper.visible = rastroLinha.visible = rastroPontos.visible = false;
  renderer.render(scene, camera);
  [juntas.visible, tcHelper.visible, rastroLinha.visible, rastroPontos.visible] = vis;
  const W = canvas.width, H = canvas.height, lado = Math.min(W, H) * 0.8;
  const out = document.createElement('canvas');
  out.width = out.height = 120;
  out.getContext('2d')!.drawImage(canvas, (W - lado) / 2, (H - lado) / 2, lado, lado, 0, 0, 120, 120);
  return out.toDataURL('image/jpeg', 0.82);
}
async function guardarPose(nome?: string) {
  if (!M || !atual) return;
  if (nome === undefined) {
    const { botao, form } = await abrirDialogo(`<h3>Guardar pose</h3>
      <label class="campo"><span>Nome</span><input type="text" name="nome" value="Pose ${biblioteca.length + 1}" autofocus></label>
      <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">Guardar</button></div>`);
    if (botao !== 'ok') return;
    nome = String(new FormData(form).get('nome') || '').trim() || `Pose ${biblioteca.length + 1}`;
  }
  const pose = poseNaTela();
  const ossos: Record<string, number[]> = {};
  for (const [n, v] of pose) ossos[n] = [...v.q.toArray(), ...v.p.toArray()];
  biblioteca.push({ id: novoId(), nome, img: miniatura(), ossos });
  montarBiblioteca();
  guardarAgora();
  status(`Pose "${nome}" guardada.`, 'ok');
}
function usarPoseGuardada(p: PoseGuardada) {
  const m = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const [n, v] of Object.entries(p.ossos)) if (M?.bones[n]) m.set(n, { q: new THREE.Quaternion(v[0], v[1], v[2], v[3]), p: new THREE.Vector3(v[4], v[5], v[6]) });
  aplicarPose(m, `Pose "${p.nome}" aplicada no quadro ${quadroAtual()}.`);
}
function montarBiblioteca() {
  const el = $('biblioteca');
  el.innerHTML = '';
  $('nPoses').textContent = biblioteca.length ? `(${biblioteca.length})` : '';
  for (const p of biblioteca) {
    const d = document.createElement('div');
    d.className = 'pose-card';
    d.title = `Aplicar "${p.nome}" neste quadro (vale o "Vale para")`;
    d.innerHTML = `${p.img ? `<img src="${p.img}" alt="">` : '<div class="sem-img"></div>'}<div class="n">${esc(p.nome)}</div><button class="x" title="Tirar da biblioteca">${ICONES.lixo}</button>`;
    d.onclick = () => usarPoseGuardada(p);
    d.querySelector('.x')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await confirmar('Tirar da biblioteca?', `A pose "${p.nome}" sai da biblioteca deste projeto.`, 'Tirar', true))) return;
      biblioteca.splice(biblioteca.indexOf(p), 1);
      montarBiblioteca();
      guardarAgora();
    });
    el.appendChild(d);
  }
  if (!biblioteca.length) el.innerHTML = '<div class="mut" style="grid-column:1/-1">Nenhuma pose guardada.</div>';
}
$('bGuardarPose').onclick = () => guardarPose();

// ---------------------------------------------------------------- editar
$('bApagarChave').onclick = () => apagarChave();
function apagarChave() {
  if (!atual) return;
  const q = quadroAtual();
  if (atual.poses) {
    if (atual.poses.length <= 2) { status('Pose a pose precisa de pelo menos 2 poses.'); return; }
    const i = atual.poses.findIndex((p) => p.f === q);
    if (i < 0) { status('Não tem pose neste quadro.'); return; }
    guardarDesfazer();
    atual.poses.splice(i, 1);
    trocarClipe(atual, gerarClipePoses(atual.nome, atual.clip.duration, atual.fps, atual.poses));
    mudou();
    status(`Pose do quadro ${q} tirada.`, 'ok');
    return;
  }
  if (!ossoSel) return;
  guardarDesfazer();
  tirarChave(ajAtual(), ossosEmEdicao(), q);
  mudou();
}
$('bZerarOsso').onclick = () => {
  if (!ossoSel || !atual) return;
  guardarDesfazer();
  for (const n of ossosEmEdicao()) delete ajAtual()[n];
  const ex = camadaExagero();
  if (ex) delete ex.fatores[ossoSel];
  mudou();
};
$('bDesfazer').onclick = () => voltar(desfazer, refazer);
$('bRefazer').onclick = () => voltar(refazer, desfazer);
$('cOriginal').onchange = (e) => { verOriginal = (e.target as HTMLInputElement).checked; rastroSujo = true; };
$('bDescartar').onclick = async () => {
  if (!atual || !temAjuste(atual.camadas)) return;
  if (!(await confirmar('Descartar os ajustes?', `As camadas de "${atual.nome}" voltam a ficar vazias. Dá pra desfazer (Ctrl+Z).`, 'Descartar', true))) return;
  guardarDesfazer();
  atual.camadas = camadasPadrao();
  atual.ativa = 0;
  mudou();
};

// ---------------------------------------------------------------- mapa do corpo (associação manual)
async function abrirMapa(foco?: Slot) {
  if (!M) return;
  const opcoes = (sel: string | undefined) => `<option value="">—</option>` + M!.listaOssos.map((n) =>
    `<option value="${esc(n)}"${n === sel ? ' selected' : ''}>${esc(M!.original(n))}</option>`).join('');
  const linhas = SLOTS.map((s) => `<span>${nomeSlot(s)}${mapaAuto[s] && mapa[s] === mapaAuto[s] ? ' <span class="auto" title="Reconhecido pelo nome">auto</span>' : ''}</span>
    <select name="${s}">${opcoes(mapa[s])}</select>`).join('');
  const { botao, form } = await abrirDialogo(`<h3>Mapa do corpo</h3>
    <div class="tabela">${linhas}</div>
    <div class="rodape"><button class="btn" value="auto" title="Volta tudo pro que foi reconhecido pelos nomes">Automático</button>
    <span style="flex:1"></span><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">OK</button></div>`,
  (f) => { if (foco) setTimeout(() => (f.elements.namedItem(foco) as HTMLSelectElement)?.focus(), 30); });
  if (botao === 'auto') mapaManual = {};
  else if (botao === 'ok') {
    mapaManual = {};
    for (const s of SLOTS) {
      const v = (form.elements.namedItem(s) as HTMLSelectElement).value;
      if ((v || undefined) !== mapaAuto[s]) mapaManual[s] = v ? M.original(v) : '';
    }
  } else return;
  recalcularMapa();
  escolherOsso(ossoSel);
  mudou(false);
  guardarAgora();
}
$('bMapa').onclick = () => abrirMapa();

// ---------------------------------------------------------------- acessórios em encaixes
interface Acessorio { s: AcessorioSalvo; grupo: THREE.Group; enc: Encaixe }
let acessorios: Acessorio[] = [];
let modoAcessorio: 'mover' | 'girar' = 'mover';
const encaixesDe = () => (M ? M.encaixes.filter((e) => e.tipo === 'encaixe') : []);
function mostrarFaixaEncaixes() {
  const el = $('faixaEncaixe');
  const enc = encaixesDe();
  if (!M || !enc.length || encaixesVistos || acessorios.length) { el.hidden = true; return; }
  const nomes = enc.slice(0, 3).map((e) => e.nome).join(', ') + (enc.length > 3 ? '…' : '');
  el.innerHTML = `<span class="txt">Achei ${enc.length} encaixe${enc.length > 1 ? 's' : ''}: <b>${esc(nomes)}</b>. Quer colocar um acessório?</span>
    <button class="btn acc" id="fxSim">Colocar</button><button class="btn" id="fxNao">Agora não</button>`;
  el.hidden = false;
  const fechar = () => { el.hidden = true; encaixesVistos = true; guardarAgora(); };
  $('fxSim').onclick = () => { fechar(); entrarEdicao(false); montarAcessorios(); $('acessorios').scrollIntoView({ block: 'center' }); };
  $('fxNao').onclick = fechar;
}
function eulerYXZ(g: THREE.Group) { const e = new THREE.Euler().setFromQuaternion(g.quaternion, 'YXZ'); return [e.x / RAD, e.y / RAD, e.z / RAD]; }
function aplicarTransformAcessorio(x: Acessorio) {
  x.grupo.position.fromArray(x.s.pos);
  x.grupo.rotation.set(x.s.rot[0] * RAD, x.s.rot[1] * RAD, x.s.rot[2] * RAD, 'YXZ');
  x.grupo.scale.setScalar(x.s.escala || 1);
  x.grupo.visible = x.s.visivel;
}
function lerTransformAcessorio(x: Acessorio) {
  x.s.pos = x.grupo.position.toArray();
  x.s.rot = eulerYXZ(x.grupo);
  camposAcessorio?.forEach((c, i) => c.definir(i < 3 ? x.s.pos[i] : i < 6 ? x.s.rot[i - 3] : x.s.escala));
}
async function anexarAcessorio(s: AcessorioSalvo, avisarErro = true): Promise<Acessorio | null> {
  if (!M) return null;
  const enc = M.encaixes.find((e) => e.nome === s.encaixe);
  if (!enc) { if (avisarErro) status(`O encaixe "${s.encaixe}" não existe neste modelo.`, 'erro'); return null; }
  let c: ModeloCarregado;
  try { c = await carregarModelo([{ nome: s.arquivo, bytes: s.bytes }]); } catch (e) { status('Não deu pra abrir o acessório: ' + (e as Error).message, 'erro'); return null; }
  const grupo = new THREE.Group();
  grupo.name = 'Acessorio_' + s.arquivo.replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_');
  grupo.userData.animasyAcessorio = true;
  grupo.add(c.root);
  grupo.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && M) prepararMalha(m, M.materiais); });
  enc.no.add(grupo);
  const x: Acessorio = { s, grupo, enc };
  aplicarTransformAcessorio(x);
  acessorios.push(x);
  if (toon) aplicarToon(true);
  return x;
}
function tirarAcessorio(x: Acessorio) {
  x.grupo.removeFromParent();
  if (M) M.materiais = M.materiais.filter(([m]) => { let dentro = false; for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p === x.grupo) dentro = true; return !dentro; });
  acessorios.splice(acessorios.indexOf(x), 1);
  if (ajustandoAcessorio === x) { ajustandoAcessorio = null; prenderGizmo(); }
}
async function colocarAcessorio(enc: Encaixe, arquivo?: ArquivoEntrada) {
  if (!M) return null;
  if (!arquivo) {
    const r = await escolherParaAbrir();
    if (!r) return null;
    const f = r.arquivos.find((x) => /\.(glb|vrm|fbx)$/i.test(x.name));
    if (!f) { status('Escolha um .glb (ou .fbx). O .gltf com arquivos soltos ainda não serve de acessório.', 'erro'); return null; }
    arquivo = { nome: f.name, bytes: await f.arrayBuffer() };
  }
  const velho = acessorios.find((x) => x.enc === enc);
  const s: AcessorioSalvo = velho ? { ...velho.s, arquivo: arquivo.nome, bytes: arquivo.bytes }
    : { id: novoId(), encaixe: enc.nome, arquivo: arquivo.nome, bytes: arquivo.bytes, pos: [0, 0, 0], rot: [0, 0, 0], escala: 1, exportar: false, visivel: true };
  if (velho) tirarAcessorio(velho);
  const x = await anexarAcessorio(s);
  encaixesVistos = true;
  $('faixaEncaixe').hidden = true;
  montarAcessorios();
  guardarAgora();
  if (x) status(`${arquivo.nome} preso em ${enc.nome}. Só aparece aqui; marque "Vai no arquivo" pra salvar junto.`, 'ok', 4500);
  return x;
}
let camposAcessorio: CampoNumero[] | null = null;
function montarAcessorios() {
  const el = $('acessorios');
  el.innerHTML = '';
  camposAcessorio = null;
  if (!M) return;
  const enc = encaixesDe();
  const malhas = M.encaixes.filter((e) => e.tipo === 'malha');
  if (!enc.length && !malhas.length) { el.innerHTML = '<div class="mut">Nenhum encaixe neste modelo.</div>'; return; }
  for (const e of enc) {
    const x = acessorios.find((a) => a.enc === e);
    const d = document.createElement('div');
    d.className = 'acess' + (x && ajustandoAcessorio === x ? ' ajustando' : '');
    d.innerHTML = `<div class="cab"><b title="${esc(e.nome)}">${esc(e.nome)}</b><small>${esc(M.original(e.osso))}</small><span class="esp"></span>
      ${x ? `<button class="btn" data-f="tirar" title="Tirar o acessório">${ICONES.lixo}</button>` : ''}</div>`;
    if (!x) {
      const b = document.createElement('button');
      b.className = 'btn larga';
      b.textContent = 'Colocar acessório…';
      b.onclick = () => colocarAcessorio(e);
      d.appendChild(b);
    } else {
      const l = document.createElement('div');
      l.className = 'linhaA';
      l.innerHTML = `<span class="mut" title="${esc(x.s.arquivo)}">${esc(x.s.arquivo)}</span>
        <label class="check" title="Mostrar na cena"><input type="checkbox" data-f="vis" ${x.s.visivel ? 'checked' : ''}> visível</label>
        <label class="check" title="Sai junto no .glb salvo (senão é só pra ver aqui)"><input type="checkbox" data-f="exp" ${x.s.exportar ? 'checked' : ''}> vai no arquivo</label>
        <button class="btn${ajustandoAcessorio === x ? ' on' : ''}" data-f="ajustar" title="Posição/rotação do encaixe com o gizmo e números">Ajustar</button>
        <button class="btn" data-f="trocar" title="Trocar o arquivo">Trocar</button>`;
      d.appendChild(l);
      (l.querySelector('[data-f=vis]') as HTMLInputElement).onchange = (ev) => { x.s.visivel = (ev.target as HTMLInputElement).checked; x.grupo.visible = x.s.visivel; guardarAgora(); };
      (l.querySelector('[data-f=exp]') as HTMLInputElement).onchange = (ev) => { x.s.exportar = (ev.target as HTMLInputElement).checked; guardarAgora(); };
      (l.querySelector('[data-f=ajustar]') as HTMLElement).onclick = () => { ajustandoAcessorio = ajustandoAcessorio === x ? null : x; if (ajustandoAcessorio && tocando) definirTocando(false); prenderGizmo(); montarAcessorios(); };
      (l.querySelector('[data-f=trocar]') as HTMLElement).onclick = () => colocarAcessorio(e);
      d.querySelector('[data-f=tirar]')!.addEventListener('click', async () => {
        if (!(await confirmar('Tirar o acessório?', `${x.s.arquivo} sai do encaixe ${e.nome} (o seu arquivo não é apagado).`, 'Tirar'))) return;
        tirarAcessorio(x); montarAcessorios(); guardarAgora();
      });
      if (ajustandoAcessorio === x) {
        const seg = document.createElement('div');
        seg.className = 'seg pequeno';
        seg.style.marginTop = '6px';
        seg.innerHTML = `<button data-m="mover" class="${modoAcessorio === 'mover' ? 'on' : ''}">Mover</button><button data-m="girar" class="${modoAcessorio === 'girar' ? 'on' : ''}">Girar</button>`;
        for (const b of seg.querySelectorAll<HTMLElement>('button')) b.onclick = () => { modoAcessorio = b.dataset.m as typeof modoAcessorio; prenderGizmo(); montarAcessorios(); };
        d.appendChild(seg);
        const cs = document.createElement('div');
        cs.className = 'campos';
        const muda = () => { aplicarTransformAcessorio(x); guardarAgora(); };
        camposAcessorio = [
          ...EIXOS.map((n, i) => new CampoNumero({ rotulo: n, titulo: `Posição ${n} (metros, no espaço do encaixe)`, passo: 0.001, casas: 4, cor: corEixo(i), mudar: (v) => { x.s.pos[i] = v; aplicarTransformAcessorio(x); }, terminar: muda })),
          ...EIXOS.map((n, i) => new CampoNumero({ rotulo: n, titulo: `Rotação ${n} (graus, ordem YXZ, como a Godot)`, passo: 0.25, casas: 2, sufixo: '°', cor: corEixo(i), mudar: (v) => { x.s.rot[i] = v; aplicarTransformAcessorio(x); }, terminar: muda })),
          new CampoNumero({ rotulo: 'Escala', passo: 0.005, casas: 3, mudar: (v) => { x.s.escala = Math.max(0.001, v); aplicarTransformAcessorio(x); }, terminar: muda }),
        ];
        cs.innerHTML = '<div class="titulo-campos">Posição (m)</div>';
        camposAcessorio.slice(0, 3).forEach((c) => cs.appendChild(c.el));
        cs.insertAdjacentHTML('beforeend', '<div class="titulo-campos">Rotação (° YXZ)</div>');
        camposAcessorio.slice(3, 6).forEach((c) => cs.appendChild(c.el));
        camposAcessorio[6].el.classList.add('largo');
        cs.appendChild(camposAcessorio[6].el);
        d.appendChild(cs);
        lerTransformAcessorio(x);
      }
    }
    el.appendChild(d);
  }
  if (malhas.length) {
    const d = document.createElement('div');
    d.innerHTML = '<div class="sub">Peças presas num osso (já vêm no modelo)</div>';
    for (const m of malhas) {
      const l = document.createElement('label');
      l.className = 'check';
      l.title = `${m.nome} · presa em ${M.original(m.osso)}`;
      l.innerHTML = `<input type="checkbox" ${m.no.visible ? 'checked' : ''}> ${esc(m.nome)} <span class="mut">(${esc(M.original(m.osso))})</span>`;
      (l.querySelector('input') as HTMLInputElement).onchange = (ev) => { m.no.visible = (ev.target as HTMLInputElement).checked; };
      d.appendChild(l);
    }
    el.appendChild(d);
  }
}


// ---------------------------------------------------------------- trazer animação de outro modelo (com prévia)
interface Previa { anim: Animacao; fonte: { scene: THREE.Scene; mixer: THREE.AnimationMixer; clip: THREE.AnimationClip; root: THREE.Object3D; cam: THREE.PerspectiveCamera } }
let previa: Previa | null = null;
function desenharPip() {
  const p = previa;
  if (!p || !M) return;
  const f = p.fonte;
  const t = acaoAtual ? acaoAtual.time : 0;
  f.mixer.setTime(Math.min(t, f.clip.duration));
  const W = canvas.clientWidth, H = canvas.clientHeight, w = Math.round(Math.min(W * 0.28, 260)), h = Math.round(w * 1.15);
  renderer.autoClear = true;
  renderer.setScissorTest(true);
  renderer.setViewport(10, 10, w, h);
  renderer.setScissor(10, 10, w, h);
  renderer.render(f.scene, f.cam);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
}
function ladoRetarget(root: THREE.Object3D, mapaSlots: Record<string, string>): LadoRetarget {
  const bones: Record<string, THREE.Bone> = {};
  const repouso = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  root.traverse((o) => { if ((o as THREE.Bone).isBone && !bones[o.name]) { bones[o.name] = o as THREE.Bone; repouso.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }); } });
  return { root, bones, mapa: mapaSlots, repouso };
}
async function trazerDeOutroModelo() {
  if (!M) return;
  const r = await escolherParaAbrir();
  if (!r) return;
  await trazerDe(await lerArquivos(r.arquivos));
}
async function trazerDe(arqs: ArquivoEntrada[], indice?: number) {
  if (!M) return null;
  let c: ModeloCarregado;
  try { c = await carregarModelo(arqs); } catch (e) { status('Não deu pra abrir: ' + (e as Error).message, 'erro'); return null; }
  if (!c.clips.length) { status('Esse modelo não tem animações.', 'erro'); return null; }
  const ossos: THREE.Bone[] = [];
  c.root.updateMatrixWorld(true);
  c.root.traverse((o) => { if ((o as THREE.Bone).isBone) ossos.push(o as THREE.Bone); });
  const nomes = new Map<string, string>();
  for (const [o, n] of c.nomeOriginal) if (o.name) nomes.set(o.name, n);
  const orig = (b: THREE.Object3D) => nomes.get(b.name) ?? b.name;
  const infos: OssoInfo[] = ossos.map((b) => ({ nome: orig(b), pai: b.parent && (b.parent as THREE.Bone).isBone ? orig(b.parent) : null, x: c.root.worldToLocal(b.getWorldPosition(_v())).x }));
  const auto = mapaAutomatico(infos, c.vrm);
  const paraThree = new Map(ossos.map((b) => [orig(b), b.name]));
  const mapaO: Record<string, string> = {};
  for (const s of Object.keys(auto) as Slot[]) { const t = paraThree.get(auto[s]!); if (t) mapaO[s] = t; }
  const comuns = SLOTS.filter((s) => mapaO[s] && mapa[s]).length;
  if (comuns < 8) { await avisar('Corpos difíceis de casar', `Só ${comuns} partes do corpo foram reconhecidas nos dois modelos. Associe as partes no Mapa do corpo e tente de novo.`); return null; }
  let i = indice;
  if (i === undefined) {
    const { botao, form } = await abrirDialogo(`<h3>Trazer qual animação?</h3>
      <p>${esc(c.principal)} · ${comuns} partes do corpo casam. Uma por vez, com prévia antes de aceitar.</p>
      <label class="campo"><span>Animação</span><select name="a">${c.clips.map((x, k) => `<option value="${k}">${esc(x.name || 'Animação ' + (k + 1))} (${fmt(x.duration)} s)</option>`).join('')}</select></label>
      <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">Ver prévia</button></div>`);
    if (botao !== 'ok') return null;
    i = Number(new FormData(form).get('a'));
  }
  const clipO = c.clips[i];
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(cor('cena'));
  cena.add(new THREE.HemisphereLight(0xdfe8ff, 0x55606f, 1.6), new THREE.DirectionalLight(0xffffff, 1.6));
  cena.add(c.root);
  const mixO = new THREE.AnimationMixer(c.root);
  mixO.clipAction(clipO).play();
  const ladoO = ladoRetarget(c.root, mapaO);
  const ladoD = ladoRetarget(M.root, mapa as Record<string, string>);
  for (const [n, v] of ladoD.repouso) { const rep = M.repouso.get(n); if (rep) { v.q.copy(rep.q); v.p.copy(rep.p); } }   // repouso dos nós, não a pose atual
  const caixa = new THREE.Box3().setFromObject(c.root, true);
  const alt = Math.max(0.1, caixa.getSize(_v()).y), ctr = caixa.getCenter(_v());
  const cam = new THREE.PerspectiveCamera(35, 1 / 1.15, 0.01, alt * 50);
  cam.position.set(ctr.x + alt * 0.6, ctr.y + alt * 0.3, ctr.z + alt * 2.2);
  cam.lookAt(ctr);
  const amostra = (t: number) => { mixO.setTime(t); c.root.updateMatrixWorld(true); };
  const nome = nomeLivre(`${clipO.name || 'Animação'} (de ${c.principal.replace(/\.[^.]+$/, '')})`);
  const { clip, ossos: n } = retargetar(ladoO, ladoD, amostra, clipO.duration, 30, nome);
  mixO.setTime(0);
  guardarDesfazer();
  const a: Animacao = { id: novoId(), nome, clip, camadas: camadasPadrao(), ativa: 0, fps: 30, nova: true };
  anims.push(a);
  tocar(a.id);
  previa = { anim: a, fonte: { scene: cena, mixer: mixO, clip: clipO, root: c.root, cam } };
  const el = $('faixaTrazer');
  el.innerHTML = `<span class="txt">Prévia: <b>${esc(nome)}</b> (${n} ossos levados). O original está no quadrinho.</span>
    <button class="btn acc" id="ftSim">Aceitar</button><button class="btn" id="ftNao">Descartar</button>`;
  el.hidden = false;
  const fim = (aceitar: boolean) => {
    el.hidden = true;
    previa = null;
    if (aceitar) { mudou(); status(`"${nome}" entrou na lista.`, 'ok'); return; }
    const k = anims.indexOf(a);
    if (k >= 0) anims.splice(k, 1);
    desfazer.pop();
    const prox = anims[Math.min(k, anims.length - 1)];
    if (prox) tocar(prox.id); else pararTudo();
    mudou(false);
    status('Descartada.');
  };
  $('ftSim').onclick = () => fim(true);
  $('ftNao').onclick = () => fim(false);
  mudou();
  return { anim: a, ossos: n, comuns, aceitar: () => fim(true), descartar: () => fim(false) };
}
$('bTrazer').onclick = trazerDeOutroModelo;

// ---------------------------------------------------------------- salvar
function nomeSaida() {
  if (!M) return 'modelo.glb';
  if (M.handle && M.podeSobrescrever) return M.handle.name;
  return M.chave.replace(/\.(gltf|fbx|vrm|glb)$/i, '') + '.glb';
}
/** Exporta e confere reabrindo. Devolve os bytes, o modelo reaberto e a maior diferença. */
async function exportarConferido() {
  if (!M) throw new Error('nenhum modelo aberto');
  const mod = M;
  for (const a of anims) limparCamadas(a.camadas);
  const assados = anims.map((a) => assarClip(a.clip, a.camadas, a.fps, mod.repouso, a.nome));
  const eraTocando = tocando, q = quadroAtual();
  mod.mixer.stopAllAction();
  restaurarBase();
  const toonAntes = toon;
  aplicarToon(false);
  for (const [o, [p, r, s]] of mod.trs) { o.position.copy(p); o.quaternion.copy(r); o.scale.copy(s); }
  // acessórios que não vão no arquivo saem antes de exportar
  const fora = acessorios.filter((x) => !x.s.exportar).map((x) => [x, x.grupo.parent] as const);
  for (const [x] of fora) x.grupo.removeFromParent();
  mod.root.updateMatrixWorld(true);
  let bytes: ArrayBuffer;
  try { bytes = await exportarGlb(mod.root, assados, mod.carregado.nomeOriginal); } finally {
    for (const [x, pai] of fora) pai?.add(x.grupo);
    aplicarToon(toonAntes);
    if (atual && M === mod) { const id = atual.id; const loop = [linha.loopA, linha.loopB]; acaoAtual = null; tocar(id); [linha.loopA, linha.loopB] = loop; if (!eraTocando) irPara(q / fpsA()); }
  }
  const reaberto = await carregarModelo([{ nome: nomeSaida(), bytes }]);
  const repArq: MapaRepouso = new Map();
  reaberto.root.traverse((o) => { if (o.name && !repArq.has(o.name)) repArq.set(o.name, { q: o.quaternion.clone(), p: o.position.clone(), s: o.scale.clone() }); });
  const dif = compararClipes(anims.map((a) => ({ clip: a.clip, camadas: a.camadas, fps: a.fps })), reaberto.clips, mod.repouso, repArq, (o) => o);
  return { bytes, reaberto, dif };
}
let salvando = false;
async function salvar(modo: 'salvar' | 'como' | 'baixar' = 'salvar') {
  if (!M || salvando) return;
  const mod = M;
  let porCima = modo === 'salvar' && mod.podeSobrescrever && !!mod.handle && temAcessoArquivos();
  if (porCima && !jaConfirmouSobrescrever) {
    if (!(await confirmar(`Salvar por cima de ${mod.handle!.name}?`, 'A versão de antes fica guardada aqui no navegador (menu ▾ > Desfazer último salvamento).', 'Salvar por cima'))) return;
  }
  if (porCima && !(await podeGravar(mod.handle!))) porCima = false;
  salvando = true;
  status('Salvando e conferindo…', '', 60000);
  try {
    const { bytes, reaberto, dif } = await exportarConferido();
    if (dif.faltando.length || dif.graus > 0.01 || dif.metros > ALTURA * 1e-4) {
      await avisar('O arquivo não ficou igual ao editor', `Não salvei. Maior diferença: ${fmt(dif.graus, 4)}° (${dif.onde || '—'}).` +
        (dif.faltando.length ? `\nFaltando: ${dif.faltando.join(', ')}` : ''));
      status('Salvamento cancelado.', 'erro');
      return;
    }
    let onde = '';
    let handle = mod.handle;
    if (modo === 'baixar') { baixar(bytes, nomeSaida()); onde = 'baixado'; }
    else if (porCima && handle) {
      const antes = await (await handle.getFile()).arrayBuffer();
      await guardarBackup({ chave: mod.chave, nome: handle.name, bytes: antes, quando: Date.now() });
      await gravarNoHandle(handle, bytes);
      jaConfirmouSobrescrever = true;
      onde = handle.name;
    } else {
      const r = await salvarComo(bytes, nomeSaida());
      if (!r) { status('Salvamento cancelado.'); return; }
      if (r.handle) { handle = r.handle; onde = r.handle.name; jaConfirmouSobrescrever = true; } else onde = 'baixado';
    }
    // reabre a partir do arquivo salvo: o que está na tela agora é o arquivo
    const nome = handle && onde !== 'baixado' ? handle.name : nomeSaida();
    const manter = { anim: atual?.nome, q: quadroAtual() };
    const lixo = lixeira, manual = mapaManual, bib = biblioteca;
    const ficam = acessorios.filter((x) => !x.s.exportar).map((x) => x.s);
    const foram = acessorios.filter((x) => x.s.exportar).length;
    const extras: ProjetoSalvo = { chave: nome, nome, arquivos: [], anims: [], lixeira: [], mapa: manual, sujo: false, atualizado: Date.now(),
      biblioteca: bib, acessorios: ficam, encaixesVistos: true };
    await montarModelo(reaberto, [{ nome, bytes }], nome, onde !== 'baixado' ? handle : mod.handle, undefined, manter, extras);
    lixeira = lixo;
    if (onde === 'baixado') { M!.handle = mod.handle; M!.podeSobrescrever = mod.podeSobrescrever; }
    mudou(false);
    await guardarAgora();
    status(`Salvo${onde === 'baixado' ? ' (baixado)' : ' em ' + onde} e conferido: diferença máx. ${fmt(dif.graus, 4)}°.` +
      (foram ? ` ${foram} acessório(s) agora fazem parte do arquivo.` : ''), 'ok', 4500);
  } catch (e) {
    status('Não deu pra salvar: ' + (e as Error).message, 'erro');
  } finally {
    salvando = false;
  }
}
async function desfazerSalvamento() {
  if (!M) return;
  const [b] = await backups(M.chave);
  if (!b || !M.handle) { status('Não tem salvamento pra desfazer.'); return; }
  const pend = anims.some((a) => temAjuste(a.camadas));
  if (!(await confirmar('Desfazer o último salvamento?', `${b.nome} volta pra versão de ${new Date(b.quando).toLocaleString('pt-BR')}.` +
    (pend ? '\nOs ajustes ainda não salvos saem.' : ''), 'Voltar versão'))) return;
  if (!(await podeGravar(M.handle))) return;
  await gravarNoHandle(M.handle, b.bytes);
  await apagarBackup(b.id!);
  const c = await carregarModelo([{ nome: b.nome, bytes: b.bytes }]);
  const naVelha = new Set(c.clips.map((x) => x.name));
  const sobram = anims.filter((a) => !naVelha.has(a.nome)).map((a) => ({ ...a, origem: undefined, excluidaEm: Date.now() }));
  const lixo = [...lixeira, ...sobram];
  const extras: ProjetoSalvo = { chave: M.chave, nome: M.chave, arquivos: [], anims: [], lixeira: [], mapa: mapaManual, sujo: false, atualizado: Date.now(),
    biblioteca, acessorios: acessorios.map((x) => x.s), encaixesVistos: true };
  await montarModelo(c, [{ nome: b.nome, bytes: b.bytes }], M.chave, M.handle, undefined, { anim: atual?.nome }, extras);
  lixeira = lixo;
  mudou(false);
  status('Versão anterior de volta.' + (sobram.length ? ` ${sobram.length} animação(ões) que não existiam nela foram pra lixeira.` : ''), 'ok', 4500);
}
$('bSalvar').onclick = () => salvar('salvar');
$('bSalvarMenu').onclick = async (e) => {
  e.stopPropagation();
  const menu = $('menuSalvar');
  if (!menu.hidden) { menu.hidden = true; return; }
  const r = $('bSalvarMenu').getBoundingClientRect();
  menu.style.left = `${r.left - 150}px`;
  menu.style.top = `${r.bottom + 4}px`;
  const temBackup = !!M?.handle && (await backups(M.chave)).length > 0;
  (menu.querySelector('[data-acao=desfazer]') as HTMLButtonElement).disabled = !temBackup;
  menu.hidden = false;
};
$('menuSalvar').onclick = (e) => {
  const a = (e.target as HTMLElement).closest('button')?.dataset.acao;
  $('menuSalvar').hidden = true;
  if (a === 'salvar') salvar('salvar');
  else if (a === 'como') salvar('como');
  else if (a === 'baixar') salvar('baixar');
  else if (a === 'desfazer') desfazerSalvamento();
};
addEventListener('click', () => { $('menuSalvar').hidden = true; });

// ---------------------------------------------------------------- configurações
async function abrirConfig() {
  const amostra = (n: NomeTema) => { const c = TEMAS[n].cores; return [c.bg, c.panel3, c.acc, c.azul, c.laranja].map((x) => `<span style="background:${x}"></span>`).join(''); };
  const opt = (v: number, l: string, sel: number) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`;
  const { botao, form } = await abrirDialogo(`<h3>Configurações</h3>
    <div class="campo"><span>Tema</span><div class="temas">${(Object.keys(TEMAS) as NomeTema[]).map((n) =>
      `<label class="tema"><input type="radio" name="tema" value="${n}" ${n === cfg.tema ? 'checked' : ''}><div class="amostra">${amostra(n)}</div>${TEMAS[n].nome}</label>`).join('')}</div></div>
    <div class="g2c">
      <label class="campo"><span>Interpolação das chaves novas</span><select name="interp">${NOME_INTERP.map((x, i) => opt(i, x, cfg.interp)).join('')}</select></label>
      <label class="campo"><span>Eixos do gizmo</span><select name="espaco"><option value="local"${cfg.espaco === 'local' ? ' selected' : ''}>Do osso (local)</option><option value="mundo"${cfg.espaco === 'mundo' ? ' selected' : ''}>Do mundo</option></select></label>
      <label class="campo"><span>Passo do giro (encaixe)</span><select name="snapRot">${[0, 1, 5, 15, 45].map((v) => opt(v, v ? `${v}°` : 'Livre', cfg.snapRot)).join('')}</select></label>
      <label class="campo"><span>Passo do mover (encaixe)</span><select name="snapPos">${[0, 0.01, 0.05, 0.1].map((v) => opt(v, v ? `${Math.round(v * 100)} cm` : 'Livre', cfg.snapPos)).join('')}</select></label>
      <label class="campo"><span>Fantasmas de cada lado</span><select name="fantasmas">${[1, 2, 3].map((v) => opt(v, String(v), cfg.fantasmas)).join('')}</select></label>
      <label class="campo"><span>De quantos em quantos quadros</span><select name="passoFantasma">${[1, 2, 3, 5, 10].map((v) => opt(v, String(v), cfg.passoFantasma)).join('')}</select></label>
    </div>
    <label class="check" title="Mostra o editor de curvas, eixos local/mundo e passo do encaixe no painel"><input type="checkbox" name="avancado" ${cfg.avancado ? 'checked' : ''}> Modo avançado (curvas e opções técnicas)</label>
    <div class="rodape"><button class="btn" value="">Cancelar</button><button class="btn acc" value="ok">OK</button></div>`,
  (f) => { for (const r of f.querySelectorAll<HTMLInputElement>('input[name=tema]')) r.onchange = () => { aplicarTema(r.value as NomeTema); coresDaCena(); }; });
  if (botao !== 'ok') { aplicarTema(cfg.tema); coresDaCena(); return; }
  const fd = new FormData(form);
  cfg.tema = (fd.get('tema') as NomeTema) || cfg.tema;
  cfg.interp = +(fd.get('interp') ?? 0);
  cfg.espaco = fd.get('espaco') === 'mundo' ? 'mundo' : 'local';
  cfg.snapRot = +(fd.get('snapRot') ?? 0);
  cfg.snapPos = +(fd.get('snapPos') ?? 0);
  cfg.fantasmas = +(fd.get('fantasmas') ?? 2);
  cfg.passoFantasma = +(fd.get('passoFantasma') ?? 3);
  cfg.avancado = fd.get('avancado') === 'on';
  aplicarConfig();
}
function aplicarConfig() {
  salvarConfig(cfg);
  aplicarTema(cfg.tema);
  coresDaCena();
  document.body.classList.toggle('avancado', cfg.avancado);
  if (!cfg.avancado && painel.modo === 'curvas') $('pcDope').click();
  atualizarChips();
  prenderGizmo();
  montarPainelAjuste();
  valoresSujos = true;
}
$('bConfig').onclick = () => abrirConfig();

// ---------------------------------------------------------------- abrir: botão, arrastar, exemplo, continuar
async function lerArquivos(fs: File[]): Promise<ArquivoEntrada[]> {
  return Promise.all(fs.map(async (f) => ({ nome: f.name, bytes: await f.arrayBuffer() })));
}
async function botaoAbrir() {
  try {
    const r = await escolherParaAbrir();
    if (r) abrirArquivos(await lerArquivos(r.arquivos), r.handle);
  } catch (e) { status('Não deu pra abrir: ' + (e as Error).message, 'erro'); }
}
$('bAbrir').onclick = botaoAbrir;
$('bAbrir2').onclick = botaoAbrir;
$('bExemplo').onclick = async () => {
  const bytes = await (await fetch(roboUrl)).arrayBuffer();
  abrirArquivos([{ nome: 'robo.glb', bytes }]);
};
let arrastos = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { arrastos++; document.body.classList.add('arrastando'); } });
addEventListener('dragleave', () => { if (--arrastos <= 0) { arrastos = 0; document.body.classList.remove('arrastando'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  arrastos = 0;
  document.body.classList.remove('arrastando');
  const dt = e.dataTransfer;
  if (!dt) return;
  const itens = [...dt.items].filter((i) => i.kind === 'file');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promHandles = itens.map((i) => ((i as any).getAsFileSystemHandle ? (i as any).getAsFileSystemHandle() : Promise.resolve(null)) as Promise<FileSystemHandle | null>);
  const arquivos = [...dt.files];
  let handle: FileSystemFileHandle | undefined;
  try {
    const hs = await Promise.all(promHandles);
    handle = hs.find((h) => h && h.kind === 'file' && ehModelo(h.name)) as FileSystemFileHandle | undefined;
  } catch { handle = undefined; }
  // soltou um modelo em cima do painel de acessórios: vira acessório
  const naAcessorio = (e.target as HTMLElement)?.closest?.('#acessorios .acess');
  if (naAcessorio && M && arquivos.length) {
    const i = [...$('acessorios').querySelectorAll('.acess')].indexOf(naAcessorio);
    const enc = encaixesDe()[i];
    if (enc) { const f = arquivos[0]; colocarAcessorio(enc, { nome: f.name, bytes: await f.arrayBuffer() }); return; }
  }
  if (arquivos.length) abrirArquivos(await lerArquivos(arquivos), handle);
});
if (noPrograma()) {      // no programa o arrasto vem do Windows (com o caminho, pra salvar por cima depois)
  ouvirArrasto((r) => { if (r.arquivos.length) lerArquivos(r.arquivos).then((a) => abrirArquivos(a, r.handle)); }, (sobre) => document.body.classList.toggle('arrastando', sobre));
}
if (location.hash === '#exemplo') $('bExemplo').click();
ultimoProjeto().then((p) => {
  if (!p || M || location.hash === '#exemplo') return;
  const b = $<HTMLButtonElement>('bContinuar');
  b.hidden = false;
  b.textContent = `Continuar: ${p.nome}`;
  b.title = `Última edição: ${new Date(p.atualizado).toLocaleString('pt-BR')}`;
  b.onclick = () => abrirArquivos(p.arquivos, p.handle, p);
});

// ---------------------------------------------------------------- teclado
addEventListener('keydown', (e) => {
  const alvo = e.target as HTMLElement;
  const tag = alvo.tagName;
  if ((tag === 'INPUT' && !['checkbox', 'range', 'radio'].includes((alvo as HTMLInputElement).type)) || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ((document.getElementById('dlg') as HTMLDialogElement).open) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyO') { botaoAbrir(); e.preventDefault(); return; }
  if (!M) return;
  if (ctrl && e.code === 'KeyS') { salvar(e.shiftKey ? 'como' : 'salvar'); e.preventDefault(); return; }
  if (ctrl && e.code === 'KeyZ') { voltar(desfazer, refazer); e.preventDefault(); return; }
  if (ctrl && e.code === 'KeyY') { voltar(refazer, desfazer); e.preventDefault(); return; }
  if (ctrl && e.code === 'KeyC' && editando) { copiarPose(); e.preventDefault(); return; }
  if (ctrl && e.code === 'KeyV' && editando) { colarPose(); e.preventDefault(); return; }
  if (ctrl) return;
  if (e.code === 'Space') { definirTocando(!tocando); e.preventDefault(); }
  else if (e.code === 'ArrowLeft') { passo(-1); e.preventDefault(); }
  else if (e.code === 'ArrowRight') { passo(1); e.preventDefault(); }
  else if (e.code === 'BracketLeft') pularChave(-1);
  else if (e.code === 'BracketRight') pularChave(1);
  else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const vis = [...$('lista').querySelectorAll<HTMLElement>('.item')].map((b) => b.dataset.id!);
    const i = atual ? vis.indexOf(atual.id) : -1;
    const n = vis[(i + (e.code === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length];
    if (n) tocar(n);
    e.preventDefault();
  } else if (e.code === 'F2' && atual) { renomear(atual); e.preventDefault(); }
  else if (e.code === 'KeyH') $('tLimpo').click();
  else if (e.code === 'KeyJ') $('tJuntas').click();
  else if (e.code === 'KeyT') $('tRastro').click();
  else if (e.code === 'KeyO') $('tFantasmas').click();
  else if (e.code === 'KeyK') abrirPainelChaves();
  else if (editando && e.code === 'KeyM') espelharPose();
  else if (editando && e.code === 'KeyR') definirFerramenta('girar');
  else if (editando && e.code === 'KeyG') definirFerramenta('mover');
  else if (editando && e.code === 'Delete') apagarChave();
  else if (editando && e.code === 'Escape') escolherOsso(null);
});

// ---------------------------------------------------------------- folha de quadros
function folha(n = 12, cols = 4) {
  if (!acaoAtual || !M) return;
  const d = acaoAtual.getClip().duration;
  const W = canvas.width, H = canvas.height, cw = Math.round(W / 2), ch = Math.round(H / 2);
  const out = document.createElement('canvas');
  out.width = cw * cols; out.height = ch * Math.ceil(n / cols);
  const g = out.getContext('2d')!;
  const t0 = acaoAtual.time, eraTocando = tocando;
  const vis = [juntas.visible, tcHelper.visible, rastroLinha.visible];
  juntas.visible = tcHelper.visible = rastroLinha.visible = rastroPontos.visible = false;
  for (let i = 0; i < n; i++) {
    const t = d * i / Math.max(1, n - 1);
    irPara(t);
    aplicarAjustes();
    M.root.updateMatrixWorld(true);
    renderer.render(scene, camera);
    g.drawImage(canvas, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    g.fillStyle = cor('txt'); g.font = 'bold 18px system-ui';
    g.fillText(`${Math.round(t * fpsA())}`, (i % cols) * cw + 8, Math.floor(i / cols) * ch + 22);
  }
  [juntas.visible, tcHelper.visible, rastroLinha.visible] = vis;
  rastroPontos.visible = vis[2];
  irPara(t0);
  if (eraTocando) definirTocando(true);
  ($('folha').querySelector('img') as HTMLImageElement).src = out.toDataURL();
  $('folha').style.display = 'block';
}
$('bFolha').onclick = () => folha();
$('folha').onclick = () => { $('folha').style.display = 'none'; };

// ---------------------------------------------------------------- laço
function redimensionar() {
  const r = canvas.parentElement!.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
  if (!mexeuNaCamera) enquadrar();
}
new ResizeObserver(redimensionar).observe(canvas.parentElement!);
redimensionar();
const relogio = new THREE.Clock();
function umQuadro(dt: number) {
  if (M) {
    const vel = parseFloat(($('vel') as HTMLInputElement).value);
    restaurarBase();
    M.mixer.update(tocando ? dt * vel : 0);
    if (tocando && acaoAtual && linha.temLoop()) {
      const a = linha.loopA!, b = linha.loopB!;
      const f = acaoAtual.time * fpsA();
      if (f > b || f < a) {
        acaoAtual.time = (a + ((f - a) % (b - a) + (b - a)) % (b - a)) / fpsA();
        restaurarBase();
        M.mixer.update(0);
      }
    }
    aplicarAjustes();
    M.root.updateMatrixWorld(true);
    if (editando) {
      atualizarJuntas();
      const m = ferramenta === 'mover' && !ajustandoAcessorio ? modoMover(ossoSel) : null;
      if (m?.tipo === 'cadeia' && !tc.dragging) { M.bones[m.ponta].getWorldPosition(alvoIK.position); alvoIK.updateMatrixWorld(true); }
      if (valoresSujos || tocando || tc.dragging || painelSujo) { atualizarValores(); painelSujo = false; }
    }
    if (rastroSujo && performance.now() - rastroT > 90) calcularRastro();
    if (($('cEsteira') as HTMLInputElement).checked && tocando) texChao.offset.y += ((parseFloat(($('esteiraV') as HTMLInputElement).value) || 0) * dt * vel) / (2 * CASA);
    $('bLoopX').style.display = linha.loopA !== null ? 'inline-block' : 'none';
    $('rotulo').textContent = acaoAtual ? `${quadroAtual()} / ${quadros()}` : '';
    if (!$('painelChaves').hidden) {
      painel.desenhar();
      $('pcInfo').textContent = atual?.poses ? 'Pose a pose: arraste uma pose no tempo' : painel.modo === 'curvas' ? (ossoSel ? `${rotulo(ossoSel)}: arraste um ponto pra mudar o valor` : '') : `Camada: ${atual?.camadas[atual.ativa]?.nome ?? ''}`;
    }
  }
  linha.desenhar();
  controls.update();
  renderizar();
  desenharPip();
}
// O three.js só agenda o próximo quadro DEPOIS do callback: uma exceção aqui matava o desenho (a tela congelava
// enquanto os painéis, que são HTML, continuavam respondendo). Agora cada quadro é protegido.
let errosSeguidos = 0, avisouErro = 0, contextoPerdido = false;
function quadroProtegido() {
  if (contextoPerdido) return;
  try {
    umQuadro(Math.min(relogio.getDelta(), 0.1));
    errosSeguidos = 0;
  } catch (e) {
    errosSeguidos++;
    // devolve o renderer e a cena ao estado normal (o erro pode ter vindo no meio dos fantasmas ou da prévia)
    try {
      renderer.autoClear = true; renderer.setScissorTest(false); scene.overrideMaterial = null;
      renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
      restaurarBase();
    } catch { /* segue */ }
    console.error('[Animasy] erro ao desenhar um quadro', e);
    (window as unknown as { __erroAnimasy?: unknown }).__erroAnimasy = e;
    if (performance.now() - avisouErro > 8000) {
      avisouErro = performance.now();
      status('Algo deu errado ao desenhar. Seu trabalho está guardado; os detalhes estão no console (F12).', 'erro', 5000);
    }
    if (errosSeguidos > 30) {      // erro que não passa: para de repetir a conta que falha e só mostra a cena
      try { renderer.render(scene, camera); } catch { /* nada */ }
    }
  }
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextoPerdido = true; status('A placa de vídeo soltou o desenho. Tentando voltar…', 'erro', 6000); });
canvas.addEventListener('webglcontextrestored', () => {
  contextoPerdido = false;
  if (M) { for (const [, m0, t] of M.materiais) { for (const x of Array.isArray(m0) ? m0 : [m0]) x.needsUpdate = true; for (const x of Array.isArray(t) ? t : [t]) x.needsUpdate = true; } }
  status('Desenho de volta.', 'ok');
});
addEventListener('error', (e) => { console.error('[Animasy] erro', e.error ?? e.message); });
addEventListener('unhandledrejection', (e) => { console.error('[Animasy] promessa rejeitada', e.reason); });
renderer.setAnimationLoop(quadroProtegido);
coresDaCena();
atualizarChips();
atualizarAjudas();

// ---------------------------------------------------------------- acesso pra testes automáticos (console)
Object.assign(window, {
  animasy: {
    abrirBytes: (nome: string, bytes: ArrayBuffer) => abrirArquivos([{ nome, bytes }]),
    exemplo: () => $('bExemplo').click(),
    poseNoQuadro: (q: number) => { irPara(q / fpsA()); aplicarAjustes(); M?.root.updateMatrixWorld(true); },
    avaliarEm, carregarModelo, exportarConferido, salvar, tocar, irPara, escolherOsso, entrarEdicao, definirFerramenta, definirEscopo,
    copiarPose, colarPose, folha, novaAnimacao, excluir, restaurar, duplicar, modoMover,
    voltar: () => voltar(desfazer, refazer), refazer: () => voltar(refazer, desfazer),
    gizmo: { comecar: gizmoComecou, mudar: gizmoMudou, soltar: gizmoSoltou },
    comecarEdicao, escreverEdicao, terminarEdicao,
    espelharPose, espelharAjuste, grudarPe, emendarLoop, esticarTrecho, poseAPose, exagerar, guardarPose, usarPoseGuardada,
    colocarAcessorio: (encaixe: string, nome: string, bytes: ArrayBuffer) => { const e = M?.encaixes.find((x) => x.nome === encaixe); return e ? colocarAcessorio(e, { nome, bytes }) : null; },
    desenhar: () => umQuadro(0), trazerDe,
    mudarDuracao, mudarFps, apagarChave, aplicarConfig, abrirConfig, abrirPainelChaves,
    camposRot, camposPos, painel, linha, cfg,
    estado: () => ({ M, anims, lixeira, mapa, mapaAuto, atual, acaoAtual, tc, alvoIK, ossoSel, edicao, sujo, quadroAtual: quadroAtual(), quadros: quadros(),
      acessorios, biblioteca, ferramenta, escopoSel, ver }),
    THREE, camera, controls, tc, alvoIK,
  },
});
