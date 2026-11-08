// "Assar" os ajustes: transformar animação original + camada de ajuste num clipe novo (o que vai pro arquivo).
// A conta é a mesma do editor: rotação = original × ajuste; posição = original + ajuste.
// O clipe novo tem uma chave por quadro (LINEAR) nos ossos ajustados, mais as chaves originais no meio,
// então nos quadros o arquivo bate com o editor (só sobra o arredondamento do float32).
import { AnimationClip, Interpolant, KeyframeTrack, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { AjustesClip, evalPos, evalRot } from './ajustes';

export interface Repouso { q: Quaternion; p: Vector3; s: Vector3 }
export type MapaRepouso = Map<string, Repouso>;   // nome do osso (o do three) → pose de repouso

const trilha = (clip: AnimationClip, osso: string, prop: string) => clip.tracks.find((t) => t.name === `${osso}.${prop}`);

/** Valor local de um osso num instante, só pela animação (sem ajuste). */
export function valorOriginal(clip: AnimationClip, osso: string, t: number, rep: Repouso | undefined) {
  const q = rep ? rep.q.clone() : new Quaternion();
  const p = rep ? rep.p.clone() : new Vector3();
  const tq = trilha(clip, osso, 'quaternion'), tp = trilha(clip, osso, 'position');
  if (tq) { const v = avaliar(tq, t); q.set(v[0], v[1], v[2], v[3]); }
  if (tp) { const v = avaliar(tp, t); p.set(v[0], v[1], v[2]); }
  return { q, p };
}

const cacheInterp = new WeakMap<KeyframeTrack, Interpolant>();
function avaliar(tr: KeyframeTrack, t: number): ArrayLike<number> {
  let i = cacheInterp.get(tr);
  if (!i) { i = tr.createInterpolant(); cacheInterp.set(tr, i); }
  return i.evaluate(t);
}

/** Valor local com o ajuste por cima (o que o editor mostra com a animação sozinha, peso 1). */
export function valorAjustado(clip: AnimationClip, aj: AjustesClip | undefined, osso: string, t: number, fps: number, rep: Repouso | undefined) {
  const { q, p } = valorOriginal(clip, osso, t, rep);
  const a = aj?.[osso];
  if (a?.rot) q.multiply(evalRot(a.rot, t * fps));
  if (a?.pos) p.add(evalPos(a.pos, t * fps));
  return { q, p };
}

/** Clipe novo com os ajustes aplicados. Sem ajuste, devolve uma cópia. */
export function assarClip(clip: AnimationClip, aj: AjustesClip | undefined, fps: number, repouso: MapaRepouso, nome = clip.name): AnimationClip {
  const ossos = Object.keys(aj || {});
  const ajustadas = new Set<string>();
  const novas: KeyframeTrack[] = [];
  const n = Math.round(clip.duration * fps);
  for (const osso of ossos) {
    for (const prop of ['quaternion', 'position'] as const) {
      const temAj = prop === 'quaternion' ? aj![osso].rot : aj![osso].pos;
      if (!temAj) continue;
      const orig = trilha(clip, osso, prop);
      const tempos = new Set<number>();
      for (let f = 0; f <= n; f++) tempos.add(Math.min(clip.duration, f / fps));
      if (orig) for (const t of orig.times) tempos.add(t);
      const ts = [...tempos].sort((a, b) => a - b);
      // tira tempos quase iguais (quadro e chave original no mesmo lugar)
      const lista: number[] = [];
      for (const t of ts) if (!lista.length || t - lista[lista.length - 1] > 1e-5) lista.push(t);
      const vals: number[] = [];
      let qAnt: Quaternion | null = null;
      for (const t of lista) {
        const v = valorAjustado(clip, aj, osso, t, fps, repouso.get(osso));
        if (prop === 'quaternion') {
          if (qAnt && qAnt.dot(v.q) < 0) v.q.set(-v.q.x, -v.q.y, -v.q.z, -v.q.w);   // caminho curto no slerp
          qAnt = v.q;
          vals.push(v.q.x, v.q.y, v.q.z, v.q.w);
        } else vals.push(v.p.x, v.p.y, v.p.z);
      }
      const nomeT = `${osso}.${prop}`;
      novas.push(prop === 'quaternion' ? new QuaternionKeyframeTrack(nomeT, lista, vals) : new VectorKeyframeTrack(nomeT, lista, vals));
      ajustadas.add(nomeT);
    }
  }
  const tracks = clip.tracks.filter((t) => !ajustadas.has(t.name)).map((t) => t.clone()).concat(novas);
  return new AnimationClip(nome, clip.duration, tracks);
}

/** Clipe parado numa pose: duas chaves (começo e fim) por osso. */
export function clipeParado(nome: string, duracao: number, pose: Map<string, { q: Quaternion; p: Vector3 }>, comPosicao: Set<string>): AnimationClip {
  const tracks: KeyframeTrack[] = [];
  for (const [osso, v] of pose) {
    tracks.push(new QuaternionKeyframeTrack(`${osso}.quaternion`, [0, duracao], [v.q.x, v.q.y, v.q.z, v.q.w, v.q.x, v.q.y, v.q.z, v.q.w]));
    if (comPosicao.has(osso)) tracks.push(new VectorKeyframeTrack(`${osso}.position`, [0, duracao], [v.p.x, v.p.y, v.p.z, v.p.x, v.p.y, v.p.z]));
  }
  return new AnimationClip(nome, duracao, tracks);
}

/** Ângulo (graus) entre duas rotações, sem o erro do acos perto de 1. */
export function anguloQuat(a: Quaternion, b: Quaternion): number {
  const s = a.dot(b) < 0 ? -1 : 1;
  const d = Math.hypot(a.x - s * b.x, a.y - s * b.y, a.z - s * b.z, a.w - s * b.w);
  const m = Math.hypot(a.x + s * b.x, a.y + s * b.y, a.z + s * b.z, a.w + s * b.w);
  return 4 * Math.atan2(d, m) * 180 / Math.PI;
}

export interface Diferenca { graus: number; metros: number; onde: string }

/**
 * Confere um arquivo salvo: pra cada animação, compara quadro a quadro o valor de cada osso no arquivo reaberto
 * com o que o editor mostra. Devolve a maior diferença (em graus e metros) e onde aconteceu.
 */
export function compararClipes(esperado: { clip: AnimationClip; aj?: AjustesClip }[], reaberto: AnimationClip[], fps: number,
  repEditor: MapaRepouso, repArquivo: MapaRepouso, nomeArquivo: (osso: string) => string): Diferenca & { faltando: string[] } {
  const r = { graus: 0, metros: 0, onde: '', faltando: [] as string[] };
  for (const { clip, aj } of esperado) {
    const outro = reaberto.find((c) => c.name === clip.name);
    if (!outro) { r.faltando.push(clip.name); continue; }
    const ossos = new Set<string>();
    for (const t of clip.tracks) ossos.add(t.name.slice(0, t.name.lastIndexOf('.')));
    for (const o of Object.keys(aj || {})) ossos.add(o);
    const n = Math.round(clip.duration * fps);
    for (let f = 0; f <= n; f++) {
      const t = Math.min(clip.duration, f / fps);
      for (const o of ossos) {
        const a = valorAjustado(clip, aj, o, t, fps, repEditor.get(o));
        const b = valorOriginal(outro, nomeArquivo(o), t, repArquivo.get(nomeArquivo(o)));
        const g = anguloQuat(a.q, b.q);
        const m = a.p.distanceTo(b.p);
        if (g > r.graus) { r.graus = g; r.onde = `${clip.name} · ${o} · quadro ${f}`; }
        if (m > r.metros) r.metros = m;
      }
    }
  }
  return r;
}
