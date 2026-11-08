// Animasy: ver e ajustar animações de qualquer personagem riggado, direto no navegador.
import './estilo.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  AjustesClip, ChaveEmEdicao, chavesPorQuadro, escreverChave, evalPos, evalRot, limparAjustes, moverChave, prepararChave, tirarChave,
} from './nucleo/ajustes';
import { resolverIK, ehAncestral } from './nucleo/ik';
import { alvoMover, cadeiaIK, MapaCorpo, mapaAutomatico, nomeSlot, OssoInfo, Slot, SLOTS } from './nucleo/mapaCorpo';
import { assarClip, clipeParado, compararClipes, MapaRepouso } from './nucleo/assar';
import { ArquivoEntrada, carregarModelo, ehModelo, ModeloCarregado } from './arquivos/abrir';
import { baixar, escolherParaAbrir, exportarGlb, gravarNoHandle, podeGravar, salvarComo, temAcessoArquivos } from './arquivos/salvar';
import { AnimSalva, apagarBackup, backups, guardarBackup, guardarProjeto, lerProjeto, ProjetoSalvo, ultimoProjeto } from './arquivos/projeto';
import { abrirDialogo, avisar, confirmar, esc } from './interface/dialogo';
import { aplicarIcones, ICONES } from './interface/icones';
import { LinhaTempo } from './interface/linhaTempo';
import roboUrl from './exemplos/robo.glb?url';

const FPS = 30;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const _v = () => new THREE.Vector3();
const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
aplicarIcones();

// ---------------------------------------------------------------- cena
const canvas = $<HTMLCanvasElement>('tela');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const corFundo = { escuro: new THREE.Color('#2a3146'), claro: new THREE.Color('#c9dcef') };
scene.background = corFundo.escuro;
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
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x55606f, 1.1));
const sol = new THREE.DirectionalLight(0xfff1dc, 2.2);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
scene.add(sol, sol.target);
const cc = document.createElement('canvas');
cc.width = cc.height = 128;
const cx = cc.getContext('2d')!;
for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#5c7a52' : '#6b8a5f'; cx.fillRect(i * 64, j * 64, 64, 64); }
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

// ---------------------------------------------------------------- estado
interface Animacao { id: string; nome: string; clip: THREE.AnimationClip; ajustes: AjustesClip; origem?: number; nova?: boolean; excluidaEm?: number }
interface Modelo {
  carregado: ModeloCarregado;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  bones: Record<string, THREE.Bone>;        // nome do three → osso
  listaOssos: string[];
  original: (n: string) => string;            // nome do three → nome do arquivo
  repouso: MapaRepouso;
  trs: Map<THREE.Object3D, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>;
  materiais: [THREE.Mesh, THREE.Material | THREE.Material[], THREE.Material | THREE.Material[]][];
  malhas: THREE.SkinnedMesh[];
  arquivos: ArquivoEntrada[];
  chave: string;
  handle?: FileSystemFileHandle;
  podeSobrescrever: boolean;
}
let M: Modelo | null = null;
let anims: Animacao[] = [], lixeira: Animacao[] = [];
let mapaAuto: MapaCorpo = {}, mapaManual: MapaCorpo = {}, mapa: MapaCorpo = {};   // nomes do arquivo (manual) / do three (mapa)
let atual: Animacao | null = null, acaoAtual: THREE.AnimationAction | null = null;
let sujo = false, jaConfirmouSobrescrever = false;
const slotDe = (osso: string) => (Object.keys(mapa) as Slot[]).find((s) => mapa[s] === osso);
const rotulo = (osso: string) => { const s = slotDe(osso); return s ? nomeSlot(s) : M ? M.original(osso) : osso; };
const ajAtual = (): AjustesClip => (atual ? atual.ajustes : {});

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
  M = null;
  atual = null; acaoAtual = null;
}

async function abrirArquivos(arquivos: ArquivoEntrada[], handle?: FileSystemFileHandle, salvo?: ProjetoSalvo) {
  const principal = arquivos.find((a) => ehModelo(a.nome));
  if (!principal) { status('Isso não parece um modelo 3D (.glb, .gltf, .vrm ou .fbx).', 'erro'); return; }
  // projeto antigo desse arquivo (ajustes não salvos, lixeira, mapa)?
  if (!salvo) {
    const velho = await lerProjeto(principal.nome);
    if (velho && (velho.sujo || velho.lixeira.length) && mesmosBytes(velho.arquivos, arquivos)) {
      if (await confirmar('Continuar de onde parou?', `Tem mudanças não salvas de "${principal.nome}" guardadas aqui.`, 'Continuar')) salvo = velho;
    }
  }
  status('Abrindo…', '', 20000);
  let c: ModeloCarregado;
  try { c = await carregarModelo(arquivos); } catch (e) {
    status('Não deu pra abrir: ' + (e as Error).message, 'erro');
    return;
  }
  montarModelo(c, arquivos, principal.nome, handle ?? salvo?.handle, salvo);
  status(`${principal.nome} aberto.`, 'ok');
}
function mesmosBytes(a: ArquivoEntrada[], b: ArquivoEntrada[]) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.nome === b[i].nome && x.bytes.byteLength === b[i].bytes.byteLength);
}

function montarModelo(c: ModeloCarregado, arquivos: ArquivoEntrada[], chave: string, handle?: FileSystemFileHandle, salvo?: ProjetoSalvo,
  manter?: { anim?: string; q?: number }) {
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
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(m as THREE.SkinnedMesh);
      const m0 = m.material;
      const toon = (Array.isArray(m0) ? m0 : [m0]).map((x) => {
        const mm = x as THREE.MeshStandardMaterial;
        return new THREE.MeshToonMaterial({ color: mm.color, map: mm.map, gradientMap: grad, transparent: mm.transparent, alphaTest: mm.alphaTest, side: mm.side });
      });
      materiais.push([m, m0, Array.isArray(m0) ? toon : toon[0]]);
    }
  });
  const orig = new Map<string, string>();
  for (const [o, n] of c.nomeOriginal) if (o.name && !orig.has(o.name)) orig.set(o.name, n);
  const mixer = new THREE.AnimationMixer(root);
  M = { carregado: c, root, mixer, bones, listaOssos: ordem, original: (n) => orig.get(n) ?? n, repouso, trs, materiais, malhas,
    arquivos, chave, handle, podeSobrescrever: !!handle && /\.(glb|vrm)$/i.test(handle.name) };
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
  // esqueleto
  const sh = new THREE.SkeletonHelper(root);
  helper.add(sh);
  helper.visible = false;
  montarJuntas();
  // mapa do corpo
  const infos: OssoInfo[] = ordem.map((n) => {
    const b = bones[n];
    const p = root.worldToLocal(b.getWorldPosition(_v()));
    const pai = b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : null;
    return { nome: M!.original(n), pai: pai ? M!.original(pai) : null, x: p.x };
  });
  const paraThree = new Map(ordem.map((n) => [M!.original(n), n]));
  const autoOrig = mapaAutomatico(infos, c.vrm);
  mapaAuto = {};
  for (const s of Object.keys(autoOrig) as Slot[]) { const t = paraThree.get(autoOrig[s]!); if (t) mapaAuto[s] = t; }
  mapaManual = { ...(salvo?.mapa || {}) };
  recalcularMapa();
  // animações
  anims = []; lixeira = [];
  desfazer.length = refazer.length = 0;
  if (salvo) {
    const viva = (s: AnimSalva): Animacao | null => {
      let clip: THREE.AnimationClip | undefined;
      if (s.origem !== undefined && c.clips[s.origem]) clip = c.clips[s.origem];
      else if (s.clipe) clip = THREE.AnimationClip.parse(s.clipe as THREE.AnimationClipJSON);
      if (!clip) return null;
      clip.name = s.nome;
      return { id: s.id, nome: s.nome, clip, ajustes: s.ajustes || {}, origem: s.clipe ? undefined : s.origem, nova: s.nova, excluidaEm: s.excluidaEm };
    };
    anims = salvo.anims.map(viva).filter(Boolean) as Animacao[];
    lixeira = salvo.lixeira.map(viva).filter(Boolean) as Animacao[];
    sujo = salvo.sujo;
  } else {
    anims = c.clips.map((clip, i) => ({ id: novoId(), nome: clip.name || `Animação ${i + 1}`, clip, ajustes: {}, origem: i }));
    for (const a of anims) a.clip.name = a.nome;
    sujo = false;
  }
  // interface
  $('vazio').hidden = true;
  $('modeloNome').textContent = chave + (c.formato === 'fbx' ? ' (FBX: salva como .glb)' : '');
  $('modeloNome').title = `${ordem.length} ossos · ${anims.length} animações`;
  for (const id of ['bSalvar', 'bSalvarMenu', 'bNova']) ($(id) as HTMLButtonElement).disabled = false;
  if (!ordem.length) status('Esse modelo não tem esqueleto: dá pra ver, mas não ajustar.', 'erro');
  montarSelOsso();
  ossoSel = null;
  $('ossoNome').textContent = '—';
  const inicial = anims.find((a) => a.nome === manter?.anim) || anims.find((a) => a.id === salvo?.atual) || anims.find((a) => /idle/i.test(a.nome)) || anims[0];
  if (inicial) { tocar(inicial.id); if (manter?.q !== undefined && editando) irPara(manter.q / FPS); }
  else { $('titulo').textContent = ''; $('info').textContent = 'Sem animações: crie uma com o +'; }
  mudou(false);
  if (toon) aplicarToon(true);
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

// ---------------------------------------------------------------- ajustes por cima da animação
// O three.js só reescreve um osso quando o valor da animação MUDA: cada osso mexido aqui volta pra pose base antes
// do próximo quadro, senão o ajuste somaria de novo a cada quadro.
const mexidos = new Map<THREE.Object3D, [THREE.Quaternion, THREE.Vector3]>();
const bases = new Map<string, [THREE.Quaternion, THREE.Vector3]>();
const QI = new THREE.Quaternion();
function marcar(b: THREE.Object3D) { if (!mexidos.has(b)) mexidos.set(b, [b.quaternion.clone(), b.position.clone()]); }
function restaurarBase() {
  for (const [b, [q, p]] of mexidos) { b.quaternion.copy(q); b.position.copy(p); }
  mexidos.clear();
}
function cadeiaDe(ponta: Slot | null): string[] | null {
  if (!M || !ponta) return null;
  const c = cadeiaIK(mapa, ponta);
  if (!c) return null;
  const [A, B, C] = c.map((n) => M!.bones[n]);
  return A && B && C && ehAncestral(A, B) && ehAncestral(B, C) ? c : null;
}
/** O que "mover" faz com o osso selecionado: IK na cadeia, mover o quadril, ou nada (só gira). */
function modoMover(osso: string | null): { tipo: 'ik'; cadeia: string[] } | { tipo: 'quadril' } | null {
  if (!osso || !M) return null;
  const alvo = alvoMover(slotDe(osso));
  if (alvo === 'quadril') return { tipo: 'quadril' };
  const c = cadeiaDe(alvo);
  return c ? { tipo: 'ik', cadeia: c } : null;
}
function ossosEmEdicao(): string[] {
  if (!ossoSel) return [];
  if (ferramenta === 'mover') {
    const m = modoMover(ossoSel);
    if (m?.tipo === 'ik') return m.cadeia;
  }
  return [ossoSel];
}
function aplicarAjustes() {
  if (!M) return;
  bases.clear();
  for (const n of ossosEmEdicao()) {
    const b = M.bones[n];
    marcar(b);
    bases.set(n, [b.quaternion.clone(), b.position.clone()]);
  }
  if (($('cOriginal') as HTMLInputElement).checked) return;
  for (const a of anims) {
    const ossos = a.ajustes;
    if (!Object.keys(ossos).length) continue;
    const ac = M.mixer.existingAction(a.clip);
    if (!ac || !ac.enabled) continue;
    const w = ac.getEffectiveWeight();
    if (w <= 0.0001) continue;
    const f = ac.time * FPS;
    for (const nome in ossos) {
      const b = M.bones[nome] || M.root.getObjectByName(nome);
      if (!b) continue;
      marcar(b);
      if (ossos[nome].rot) b.quaternion.multiply(QI.clone().slerp(evalRot(ossos[nome].rot, f), w));
      if (ossos[nome].pos) b.position.addScaledVector(evalPos(ossos[nome].pos, f), w);
    }
  }
}

// ---------------------------------------------------------------- desfazer / refazer (ajustes e lista de animações)
interface Foto { anims: { a: Animacao; nome: string; aj: string }[]; lixo: { a: Animacao; nome: string; aj: string; em?: number }[]; atual?: string }
const desfazer: Foto[] = [], refazer: Foto[] = [];
const foto = (): Foto => ({
  anims: anims.map((a) => ({ a, nome: a.nome, aj: JSON.stringify(a.ajustes) })),
  lixo: lixeira.map((a) => ({ a, nome: a.nome, aj: JSON.stringify(a.ajustes), em: a.excluidaEm })),
  atual: atual?.id,
});
function guardarDesfazer() {
  desfazer.push(foto());
  if (desfazer.length > 200) desfazer.shift();
  refazer.length = 0;
}
function voltar(de: Foto[], para: Foto[]) {
  const s = de.pop();
  if (!s) return;
  para.push(foto());
  const viva = (x: { a: Animacao; nome: string; aj: string; em?: number }) => {
    x.a.nome = x.nome; x.a.clip.name = x.nome; x.a.ajustes = JSON.parse(x.aj); x.a.excluidaEm = x.em;
    return x.a;
  };
  anims = s.anims.map(viva);
  lixeira = s.lixo.map(viva);
  if (!atual || !anims.includes(atual)) { const a = anims.find((x) => x.id === s.atual) || anims[0]; if (a) tocar(a.id); else pararTudo(); }
  mudou();
}

// ---------------------------------------------------------------- guardar o projeto no navegador
let guardarT = 0;
function mudou(marcarSujo = true) {
  if (marcarSujo) sujo = true;
  for (const a of anims) limparAjustes(a.ajustes);
  $('bSalvar').classList.toggle('sujo', sujo);
  $('bSalvar').title = sujo ? 'Salvar .glb (Ctrl+S) · tem mudanças não salvas' : 'Salvar .glb (Ctrl+S)';
  ($('bDescartar') as HTMLButtonElement).disabled = !Object.keys(ajAtual()).length;
  montarLista();
  montarLixeira();
  montarCorpo();
  rastroSujo = true;
  clearTimeout(guardarT);
  guardarT = window.setTimeout(guardarAgora, 500);
}
function paraSalvar(a: Animacao, sempreClipe = false): AnimSalva {
  const s: AnimSalva = { id: a.id, nome: a.nome, ajustes: a.ajustes, nova: a.nova, excluidaEm: a.excluidaEm };
  if (a.origem !== undefined && !sempreClipe) s.origem = a.origem;
  else s.clipe = THREE.AnimationClip.toJSON(a.clip);
  return s;
}
async function guardarAgora() {
  if (!M) return;
  const p: ProjetoSalvo = { chave: M.chave, nome: M.chave, arquivos: M.arquivos, anims: anims.map((a) => paraSalvar(a)),
    lixeira: lixeira.map((a) => paraSalvar(a, true)), mapa: mapaManual, handle: M.handle, sujo, atual: atual?.id, atualizado: Date.now() };
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
    const temAj = Object.keys(a.ajustes).length > 0;
    it.innerHTML = `<span class="nome" title="${esc(a.nome)}">${esc(a.nome)}</span>${temAj || a.nova ? `<span class="marca-aj" title="${temAj ? 'Tem ajustes não salvos' : 'Nova (ainda não salva)'}">•</span>` : ''}
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
function duplicar(a: Animacao) {
  guardarDesfazer();
  const nova: Animacao = { id: novoId(), nome: nomeLivre(a.nome + ' (cópia)'), clip: a.clip.clone(), ajustes: JSON.parse(JSON.stringify(a.ajustes)), nova: true };
  nova.clip.name = nova.nome;
  anims.splice(anims.indexOf(a) + 1, 0, nova);
  tocar(nova.id);
  mudou();
  status(`"${nova.nome}" criada.`, 'ok');
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
    duplicar(atual);
    const a = atual as Animacao;
    a.nome = nomeLivre(nome, a); a.clip.name = a.nome;
    mudou();
    tocar(a.id);
    return;
  }
  const dur = Math.max(0.1, Number(fd.get('dur')) || 1);
  const pose = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  const comPos = new Set<string>();
  if (de === 'pose') {
    // pose que está na tela agora (com ajustes)
    for (const n of M.listaOssos) { const b = M.bones[n]; pose.set(n, { q: b.quaternion.clone(), p: b.position.clone() }); }
  } else {
    for (const n of M.listaOssos) { const r = M.repouso.get(n)!; pose.set(n, { q: r.q.clone(), p: r.p.clone() }); }
  }
  for (const [n, v] of pose) {
    const r = M.repouso.get(n);
    if (n === mapa.quadril || (r && r.p.distanceTo(v.p) > 1e-6)) comPos.add(n);
  }
  guardarDesfazer();
  const a: Animacao = { id: novoId(), nome, clip: clipeParado(nome, dur, pose, comPos), ajustes: {}, nova: true };
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
  $('titulo').textContent = a.nome;
  $('info').textContent = `${fmt(a.clip.duration)} s · ${quadros() + 1} quadros`;
  if (editando) irPara(0); else definirTocando(true);
  mudou(false);
}
const quadros = () => (acaoAtual ? Math.round(acaoAtual.getClip().duration * FPS) : 0);
const quadroAtual = () => (acaoAtual ? Math.round(acaoAtual.time * FPS) : 0);
function definirTocando(t: boolean) {
  tocando = t;
  $('bPlay').textContent = t ? '❚❚' : '▶';
  if (acaoAtual) acaoAtual.paused = !t;
  if (editando) prenderGizmo();
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
}
const passo = (d: number) => acaoAtual && irPara((quadroAtual() + d) / FPS);
$('bPlay').onclick = () => definirTocando(!tocando);
$('bAnt').onclick = () => passo(-1);
$('bProx').onclick = () => passo(1);
$('vel').oninput = (e) => { $('velV').textContent = fmt(+(e.target as HTMLInputElement).value) + 'x'; };
$('fade').oninput = (e) => { $('fadeV').textContent = fmt(+(e.target as HTMLInputElement).value); };
$('loop').onchange = () => acaoAtual && acaoAtual.setLoop(($('loop') as HTMLInputElement).checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
let toon = false;
function aplicarToon(sim: boolean) {
  toon = sim;
  if (M) for (const [o, m0, t] of M.materiais) o.material = sim ? t : m0;
}
$('cToon').onchange = (e) => aplicarToon((e.target as HTMLInputElement).checked);
$('cFundo').onchange = (e) => { scene.background = (e.target as HTMLInputElement).checked ? corFundo.claro : corFundo.escuro; };
for (const b of document.querySelectorAll<HTMLElement>('[data-cam]')) b.onclick = () => enquadrar(b.dataset.cam);
for (const b of document.querySelectorAll<HTMLElement>('[data-z]')) b.onclick = () => zoom(+b.dataset.z!);
$('bReset').onclick = () => enquadrar();

// ---------------------------------------------------------------- ajudas visuais (liga/desliga)
const ver = { juntas: true, rastro: true, limpo: false };
function atualizarAjudas() {
  $('tJuntas').classList.toggle('on', ver.juntas);
  $('tRastro').classList.toggle('on', ver.rastro);
  $('tLimpo').classList.toggle('on', ver.limpo);
  $('tOssos').classList.toggle('on', helper.visible);
  juntas.visible = editando && ver.juntas && !ver.limpo;
  rastroLinha.visible = rastroPontos.visible = ver.rastro && !ver.limpo && rastroTem;
  if (editando) prenderGizmo();
  rastroSujo = true;
}
$('tJuntas').onclick = () => { ver.juntas = !ver.juntas; atualizarAjudas(); };
$('tRastro').onclick = () => { ver.rastro = !ver.rastro; atualizarAjudas(); };
$('tLimpo').onclick = () => { ver.limpo = !ver.limpo; atualizarAjudas(); };
$('tOssos').onclick = () => { helper.visible = !helper.visible; atualizarAjudas(); };
$('tAjuda').onclick = () => { $('atalhos').hidden = !$('atalhos').hidden; };

// ---------------------------------------------------------------- linha do tempo
function ossosDaLinha() {             // de quem são os losangos amarelos: selecionado (ou todos, sem seleção)
  const A = ajAtual();
  const sel = ossosEmEdicao();
  return sel.length ? sel.filter((n) => A[n]) : Object.keys(A);
}
const linha = new LinhaTempo($<HTMLCanvasElement>('linha'), {
  quadros,
  quadroAgora: () => (acaoAtual ? acaoAtual.time * FPS : 0),
  chaves: () => chavesPorQuadro(ajAtual(), ossosDaLinha()),
  chavesOutros: () => { const meus = ossosDaLinha(); return chavesPorQuadro(ajAtual(), Object.keys(ajAtual()).filter((o) => !meus.includes(o))); },
  irPara: (q) => irPara(q / FPS),
  comecarArrasteChave: guardarDesfazer,
  moverChave: (de, para) => { const ok = moverChave(ajAtual(), ossosDaLinha(), de, para); if (ok) rastroSujo = true; return ok; },
  fimArrasteChave: (moveu) => { if (moveu) mudou(); else desfazer.pop(); },
  loopMudou: (_a, _b, tocar) => { rastroSujo = true; if (tocar) definirTocando(true); },
});
$('bLoopX').onclick = () => linha.tirarLoop();

// ---------------------------------------------------------------- rastro do movimento (o caminho inteiro)
const rastroLinha = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf3b94d, transparent: true, opacity: 0.8, depthTest: false }));
const rastroPontos = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, depthTest: false }));
rastroLinha.renderOrder = rastroPontos.renderOrder = 998;
rastroLinha.frustumCulled = rastroPontos.frustumCulled = false;
scene.add(rastroLinha, rastroPontos);
let rastroSujo = true, rastroT = 0, rastroTem = false;
function pontoRastro(): (() => THREE.Vector3) | null {      // o que o rastro segue: a ponta do osso (ou a mão/pé no "mover")
  if (!M || !ossoSel) return null;
  const m = ferramenta === 'mover' ? modoMover(ossoSel) : null;
  if (m?.tipo === 'ik') { const b = M.bones[m.cadeia[2]]; return () => b.getWorldPosition(_v()); }
  const b0 = M.bones[ossoSel];
  if (m?.tipo === 'quadril') return () => b0.getWorldPosition(_v());
  const filho = b0.children.find((c) => (c as THREE.Bone).isBone);
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
  const a = linha.loopA !== null ? linha.loopA : 0, b = linha.loopB !== null ? linha.loopB : n;
  const t0 = acaoAtual.time;
  const pts: THREE.Vector3[] = [], cores: number[] = [];
  const chaves = chavesPorQuadro(ajAtual(), ossosDaLinha());
  for (let f = a; f <= b; f++) {
    acaoAtual.time = f / FPS;
    restaurarBase();
    M.mixer.update(0);
    aplicarAjustes();
    M.root.updateMatrixWorld(true);
    pts.push(pega());
    cores.push(...(chaves.has(f) && !chaves.get(f) ? [1, 0.75, 0.3] : [0.9, 0.93, 1]));
  }
  rastroLinha.geometry.setFromPoints(pts);
  rastroPontos.geometry.setFromPoints(pts);
  rastroPontos.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  acaoAtual.time = t0;
  restaurarBase();
  M.mixer.update(0);
  aplicarAjustes();
  M.root.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- modo de ajuste
let editando = false, ossoSel: string | null = null, ferramenta: 'girar' | 'mover' = 'girar';
let edicao: { f: number; tudo: boolean; chaves: ChaveEmEdicao[]; modo: 'girar' | 'quadril' | 'ik'; cadeia?: string[]; inicio?: THREE.Quaternion[] } | null = null;
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
    const m = new THREE.Mesh(geoJ, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 999;
    m.userData.osso = n;
    juntas.add(m);
    marcadores.push(m);
  }
}
function atualizarJuntas() {
  if (!M) return;
  const r = ALTURA * 0.016;
  const ossos = ajAtual();
  const ed = new Set(ossosEmEdicao());
  const comMapa = new Set(Object.values(mapa));
  for (const m of marcadores) {
    const n = m.userData.osso as string;
    M.bones[n].getWorldPosition(m.position);
    const sel = n === ossoSel;
    m.scale.setScalar(sel ? r * 1.5 : ed.has(n) ? r * 1.2 : comMapa.has(n) ? r : r * 0.65);
    (m.material as THREE.MeshBasicMaterial).color.set(sel ? 0xf3b94d : ed.has(n) ? 0xffd27a : ossos[n] ? 0xff9a5c : 0x7fd8ff);
  }
}
const GRADE: (Slot | null)[][] = [
  [null, 'cabeca', null], [null, 'pescoco', null], ['ombro.R', 'peito', 'ombro.L'], ['braco.R', 'barriga', 'braco.L'],
  ['antebraco.R', 'quadril', 'antebraco.L'], ['mao.R', null, 'mao.L'], ['coxa.R', null, 'coxa.L'],
  ['canela.R', null, 'canela.L'], ['pe.R', null, 'pe.L'], ['dedos.R', null, 'dedos.L'],
];
function montarCorpo() {
  const el = $('corpo');
  el.innerHTML = '<div class="cab"><span>direita</span><span></span><span>esquerda</span></div>';
  if (!M) return;
  const aj = ajAtual();
  for (const linhaG of GRADE) for (const s of linhaG) {
    if (!s) { el.appendChild(document.createElement('span')); continue; }
    const n = mapa[s];
    const b = document.createElement('button');
    b.textContent = nomeSlot(s, true);
    if (!n) {
      b.className = 'falta';
      b.title = `${nomeSlot(s)}: nenhum osso associado (clique pra escolher)`;
      b.onclick = () => abrirMapa(s);
    } else {
      b.title = `${nomeSlot(s)} · ${M.original(n)}`;
      if (n === ossoSel) b.classList.add('on');
      if (aj[n]) b.classList.add('aj');
      b.onclick = () => escolherOsso(n);
    }
    el.appendChild(b);
  }
  const sel = $('selOsso') as HTMLSelectElement;
  sel.value = ossoSel && !slotDe(ossoSel) ? ossoSel : '';
}
function montarSelOsso() {
  const sel = $('selOsso') as HTMLSelectElement;
  sel.innerHTML = '<option value="">Outro osso…</option>';
  if (!M) return;
  for (const n of M.listaOssos) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = M.original(n);
    sel.appendChild(o);
  }
}
$('selOsso').onchange = (e) => { const v = (e.target as HTMLSelectElement).value; if (v) escolherOsso(v); };
function prenderGizmo() {
  tc.detach();
  const ativo = editando && !!ossoSel && !tocando && !ver.limpo && !!M;
  if (ativo && M) {
    const rodar = ferramenta === 'girar';
    tc.setMode(rodar ? 'rotate' : 'translate');
    tc.setSpace(rodar ? 'local' : 'world');
    if (rodar) tc.attach(M.bones[ossoSel!]);
    else {
      const m = modoMover(ossoSel);
      if (m?.tipo === 'quadril') tc.attach(M.bones[ossoSel!]);
      else if (m?.tipo === 'ik') { M.bones[m.cadeia[2]].getWorldPosition(alvoIK.position); tc.attach(alvoIK); }
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
  if (sim && acaoAtual) irPara(quadroAtual() / FPS);
  if (!sim) $('etiqueta').style.display = 'none';
  atualizarAjudas();
}
$('abaAjustar').onclick = () => entrarEdicao(true);
$('abaVer').onclick = () => entrarEdicao(false);
function escolherOsso(n: string | null) {
  ossoSel = n && M?.bones[n] ? n : null;
  if (ossoSel && ferramenta === 'mover' && !modoMover(ossoSel)) ferramenta = 'girar';
  $('ossoNome').textContent = ossoSel ? rotulo(ossoSel) : '—';
  $('ossoNome').title = ossoSel && M ? M.original(ossoSel) : '';
  definirFerramenta(ferramenta);
  montarCorpo();
}
function definirFerramenta(f: 'girar' | 'mover') {
  if (f === 'mover' && ossoSel && !modoMover(ossoSel)) {
    status(slotDe(ossoSel) ? `${rotulo(ossoSel)} só gira.` : 'Esse osso só gira. Pra mover mão/pé, associe o braço/perna no mapa do corpo.');
    return;
  }
  ferramenta = f;
  $('fGirar').classList.toggle('on', f === 'girar');
  $('fMover').classList.toggle('on', f === 'mover');
  prenderGizmo();
  rastroSujo = true;
}
$('fGirar').onclick = () => definirFerramenta('girar');
$('fMover').onclick = () => definirFerramenta('mover');

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
  // na malha: o osso que mais pesa no triângulo clicado
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

const raio = () => +($('raio') as HTMLInputElement).value || 6;
const escopoTudo = () => (document.querySelector('input[name=alc]:checked') as HTMLInputElement).value === 'tudo';
tc.addEventListener('mouseDown', () => {
  if (!ossoSel || !atual || !M) return;
  ($('cOriginal') as HTMLInputElement).checked = false;
  guardarDesfazer();
  const f = quadroAtual(), tudo = escopoTudo();
  const prep = (n: string, t: 'rot' | 'pos') => prepararChave(atual!.ajustes, n, t, f, tudo, raio(), quadros());
  if (ferramenta === 'girar') { edicao = { f, tudo, chaves: [prep(ossoSel, 'rot')], modo: 'girar' }; return; }
  const m = modoMover(ossoSel);
  if (m?.tipo === 'quadril') edicao = { f, tudo, chaves: [prep(ossoSel, 'pos')], modo: 'quadril' };
  else if (m?.tipo === 'ik') {
    edicao = { f, tudo, chaves: m.cadeia.map((n) => prep(n, 'rot')), modo: 'ik', cadeia: m.cadeia, inicio: m.cadeia.map((n) => M!.bones[n].quaternion.clone()) };
  }
});
function poleReserva(cadeia: string[]) {
  const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(M!.root.getWorldQuaternion(new THREE.Quaternion()));
  return slotDe(cadeia[2])?.startsWith('pe') ? frente : frente.negate();
}
tc.addEventListener('objectChange', () => {
  if (!edicao || !M || !ossoSel) return;
  const B = M.bones;
  if (edicao.modo === 'girar') escreverChave(edicao.chaves[0], bases.get(ossoSel)![0].clone().invert().multiply(B[ossoSel].quaternion), edicao.f, edicao.tudo);
  else if (edicao.modo === 'quadril') escreverChave(edicao.chaves[0], B[ossoSel].position.clone().sub(bases.get(ossoSel)![1]), edicao.f, edicao.tudo);
  else {
    const cad = edicao.cadeia!;
    cad.forEach((n, i) => B[n].quaternion.copy(edicao!.inicio![i]));
    resolverIK(B[cad[0]], B[cad[1]], B[cad[2]], alvoIK.getWorldPosition(_v()), poleReserva(cad));
    cad.forEach((n, i) => escreverChave(edicao!.chaves[i], bases.get(n)![0].clone().invert().multiply(B[n].quaternion), edicao!.f, edicao!.tudo));
  }
  rastroSujo = true;
});
tc.addEventListener('mouseUp', () => { if (edicao) { edicao = null; mudou(); } });

// copiar / colar pose inteira
let poseCopiada: Map<string, [THREE.Quaternion, THREE.Vector3]> | null = null;
function copiarPose() {
  if (!M) return;
  poseCopiada = new Map(M.listaOssos.map((n) => [n, [M!.bones[n].quaternion.clone(), M!.bones[n].position.clone()]]));
  status(`Pose do quadro ${quadroAtual()} copiada.`, 'ok');
}
function colarPose() {
  if (!poseCopiada || !atual || !M) return;
  guardarDesfazer();
  const f = quadroAtual(), tudo = escopoTudo();
  restaurarBase();
  M.mixer.update(0);
  const A = atual.ajustes;
  let n = 0;
  for (const nome of M.listaOssos) {
    const b = M.bones[nome];
    const cp = poseCopiada.get(nome);
    if (!cp) continue;
    const [qc, pc] = cp;
    const agora = b.quaternion.clone().multiply(evalRot(A[nome]?.rot, f));
    if (Math.abs(agora.dot(qc)) < 0.99999) { escreverChave(prepararChave(A, nome, 'rot', f, tudo, raio(), quadros()), b.quaternion.clone().invert().multiply(qc), f, tudo); n++; }
    const pa = b.position.clone().add(evalPos(A[nome]?.pos, f));
    if (pa.distanceTo(pc) > 1e-5 * ALTURA) { escreverChave(prepararChave(A, nome, 'pos', f, tudo, raio(), quadros()), pc.clone().sub(b.position), f, tudo); n++; }
  }
  mudou();
  status(n ? `Pose colada no quadro ${f}.` : 'Esse quadro já tem essa pose.', 'ok');
}
$('bCopiar').onclick = copiarPose;
$('bColar').onclick = colarPose;
$('bApagarChave').onclick = () => {
  if (!atual || !ossoSel) return;
  guardarDesfazer();
  tirarChave(atual.ajustes, ossosEmEdicao(), quadroAtual());
  mudou();
};
$('bZerarOsso').onclick = () => {
  if (!ossoSel || !atual) return;
  guardarDesfazer();
  for (const n of ossosEmEdicao()) delete atual.ajustes[n];
  mudou();
};
$('bDesfazer').onclick = () => voltar(desfazer, refazer);
$('bRefazer').onclick = () => voltar(refazer, desfazer);
$('bDescartar').onclick = async () => {
  if (!atual || !Object.keys(atual.ajustes).length) return;
  if (!(await confirmar('Descartar os ajustes?', `Os ajustes ainda não salvos de "${atual.nome}" saem. Dá pra desfazer (Ctrl+Z).`, 'Descartar', true))) return;
  guardarDesfazer();
  atual.ajustes = {};
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
  for (const a of anims) limparAjustes(a.ajustes);
  const assados = anims.map((a) => assarClip(a.clip, a.ajustes, FPS, mod.repouso, a.nome));
  // pose de repouso (o exportador grava a pose atual dos nós)
  const eraTocando = tocando, q = quadroAtual();
  mod.mixer.stopAllAction();
  restaurarBase();
  const toonAntes = toon;
  aplicarToon(false);
  for (const [o, [p, r, s]] of mod.trs) { o.position.copy(p); o.quaternion.copy(r); o.scale.copy(s); }
  mod.root.updateMatrixWorld(true);
  let bytes: ArrayBuffer;
  try { bytes = await exportarGlb(mod.root, assados, mod.carregado.nomeOriginal); } finally {
    aplicarToon(toonAntes);
    if (atual && M === mod) { const id = atual.id; acaoAtual = null; tocar(id); if (!eraTocando) irPara(q / FPS); }
  }
  const reaberto = await carregarModelo([{ nome: nomeSaida(), bytes }]);
  const repArq: MapaRepouso = new Map();
  reaberto.root.traverse((o) => { if (o.name && !repArq.has(o.name)) repArq.set(o.name, { q: o.quaternion.clone(), p: o.position.clone(), s: o.scale.clone() }); });
  const dif = compararClipes(anims.map((a) => ({ clip: a.clip, aj: a.ajustes })), reaberto.clips, FPS, mod.repouso, repArq, (o) => o);
  return { bytes, reaberto, dif };
}
let salvando = false;
async function salvar(modo: 'salvar' | 'como' | 'baixar' = 'salvar') {
  if (!M || salvando) return;
  const mod = M;
  // permissão pra gravar por cima pede o clique "fresco": pergunta antes de exportar
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
    const lixo = lixeira;
    const manual = mapaManual;
    const arquivos = [{ nome, bytes }];
    montarModelo(reaberto, arquivos, nome, onde !== 'baixado' ? handle : mod.handle, undefined, manter);
    lixeira = lixo;
    mapaManual = manual;
    recalcularMapa();
    if (onde === 'baixado') { M!.handle = mod.handle; M!.podeSobrescrever = mod.podeSobrescrever; }
    mudou(false);
    await guardarAgora();
    status(`Salvo${onde === 'baixado' ? ' (baixado)' : ' em ' + onde} e conferido: diferença máx. ${fmt(dif.graus, 4)}°.`, 'ok', 4500);
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
  const pend = anims.some((a) => Object.keys(a.ajustes).length);
  if (!(await confirmar('Desfazer o último salvamento?', `${b.nome} volta pra versão de ${new Date(b.quando).toLocaleString('pt-BR')}.` +
    (pend ? '\nOs ajustes ainda não salvos saem.' : ''), 'Voltar versão'))) return;
  if (!(await podeGravar(M.handle))) return;
  await gravarNoHandle(M.handle, b.bytes);
  await apagarBackup(b.id!);
  const c = await carregarModelo([{ nome: b.nome, bytes: b.bytes }]);
  // o que não existe na versão antiga não some: vai pra lixeira
  const naVelha = new Set(c.clips.map((x) => x.name));
  const sobram = anims.filter((a) => !naVelha.has(a.nome)).map((a) => ({ ...a, origem: undefined, excluidaEm: Date.now() }));
  const lixo = [...lixeira, ...sobram], manual = mapaManual;
  montarModelo(c, [{ nome: b.nome, bytes: b.bytes }], M.chave, M.handle, undefined, { anim: atual?.nome });
  lixeira = lixo; mapaManual = manual; recalcularMapa();
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
  // pega os handles (Chrome/Edge) antes de qualquer await: assim dá pra salvar por cima depois
  const itens = [...dt.items].filter((i) => i.kind === 'file');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promHandles = itens.map((i) => ((i as any).getAsFileSystemHandle ? (i as any).getAsFileSystemHandle() : Promise.resolve(null)) as Promise<FileSystemHandle | null>);
  const arquivos = [...dt.files];
  let handle: FileSystemFileHandle | undefined;
  try {
    const hs = await Promise.all(promHandles);
    handle = hs.find((h) => h && h.kind === 'file' && ehModelo(h.name)) as FileSystemFileHandle | undefined;
  } catch { handle = undefined; }
  if (arquivos.length) abrirArquivos(await lerArquivos(arquivos), handle);
});
if (location.hash === '#exemplo') $('bExemplo').click();     // link direto pro exemplo (ex.: demonstração)
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
  else if (editando && e.code === 'KeyR') definirFerramenta('girar');
  else if (editando && e.code === 'KeyG') definirFerramenta('mover');
  else if (editando && e.code === 'Delete') $('bApagarChave').click();
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
    g.fillStyle = '#fff'; g.font = 'bold 18px system-ui';
    g.fillText(`${Math.round(t * FPS)}`, (i % cols) * cw + 8, Math.floor(i / cols) * ch + 22);
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
    if (tocando && acaoAtual && linha.temLoop()) {     // trecho em loop
      const a = linha.loopA!, b = linha.loopB!;
      const f = acaoAtual.time * FPS;
      if (f > b || f < a) {
        acaoAtual.time = (a + ((f - a) % (b - a) + (b - a)) % (b - a)) / FPS;
        restaurarBase();
        M.mixer.update(0);
      }
    }
    aplicarAjustes();
    M.root.updateMatrixWorld(true);
    if (editando) {
      atualizarJuntas();
      const m = ferramenta === 'mover' ? modoMover(ossoSel) : null;
      if (m?.tipo === 'ik' && !tc.dragging) { M.bones[m.cadeia[2]].getWorldPosition(alvoIK.position); alvoIK.updateMatrixWorld(true); }
    }
    if (rastroSujo && performance.now() - rastroT > 90) calcularRastro();
    if (($('cEsteira') as HTMLInputElement).checked && tocando) texChao.offset.y += ((parseFloat(($('esteiraV') as HTMLInputElement).value) || 0) * dt * vel) / (2 * CASA);
    $('bLoopX').style.display = linha.loopA !== null ? 'inline-block' : 'none';
    $('rotulo').textContent = acaoAtual ? `${quadroAtual()} / ${quadros()}` : '';
  }
  linha.desenhar();
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => umQuadro(Math.min(relogio.getDelta(), 0.1)));
atualizarAjudas();

// ---------------------------------------------------------------- acesso pra testes automáticos (console)
Object.assign(window, {
  animasy: {
    abrirBytes: (nome: string, bytes: ArrayBuffer) => abrirArquivos([{ nome, bytes }]),
    exemplo: () => $('bExemplo').click(),
    poseNoQuadro: (q: number) => { irPara(q / FPS); aplicarAjustes(); M?.root.updateMatrixWorld(true); },
    exportarGlb: async () => { if (!M) return null; return exportarGlb(M.root, anims.map((a) => assarClip(a.clip, a.ajustes, FPS, M!.repouso, a.nome)), M.carregado.nomeOriginal); },
    carregarModelo,
    exportarConferido, salvar, tocar, irPara, escolherOsso, entrarEdicao, definirFerramenta, copiarPose, colarPose, folha,
    novaAnimacao, excluir, restaurar, duplicar, voltar: () => voltar(desfazer, refazer), refazer: () => voltar(refazer, desfazer),
    estado: () => ({ M, anims, lixeira, mapa, mapaAuto, atual, acaoAtual, tc, alvoIK, bases, ossoSel, edicao, sujo, quadroAtual: quadroAtual() }),
    THREE, camera, controls, tc, alvoIK,
  },
});
