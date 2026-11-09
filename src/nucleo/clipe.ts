// Ler valores de um clipe do three.js fora do mixer (pra assar, conferir, exagerar e espelhar).
import { AnimationClip, Interpolant, KeyframeTrack, Quaternion, Vector3 } from 'three';

export interface Repouso { q: Quaternion; p: Vector3; s: Vector3 }
export type MapaRepouso = Map<string, Repouso>;   // nome do osso (o do three) → pose de repouso

export const trilha = (clip: AnimationClip, osso: string, prop: string) => clip.tracks.find((t) => t.name === `${osso}.${prop}`);

const cacheInterp = new WeakMap<KeyframeTrack, Interpolant>();
export function avaliar(tr: KeyframeTrack, t: number): ArrayLike<number> {
  let i = cacheInterp.get(tr);
  if (!i) { i = tr.createInterpolant(); cacheInterp.set(tr, i); }
  return i.evaluate(t);
}

/** Valor local de um osso num instante, só pela animação (sem ajuste). */
export function valorOriginal(clip: AnimationClip, osso: string, t: number, rep: Repouso | undefined) {
  const q = rep ? rep.q.clone() : new Quaternion();
  const p = rep ? rep.p.clone() : new Vector3();
  const tq = trilha(clip, osso, 'quaternion'), tp = trilha(clip, osso, 'position');
  if (tq) { const v = avaliar(tq, t); q.set(v[0], v[1], v[2], v[3]); }
  if (tp) { const v = avaliar(tp, t); p.set(v[0], v[1], v[2]); }
  return { q, p };
}

/** Ossos que o clipe anima. */
export function ossosDoClipe(clip: AnimationClip): Set<string> {
  const s = new Set<string>();
  for (const t of clip.tracks) s.add(t.name.slice(0, t.name.lastIndexOf('.')));
  return s;
}

/** Rotação q elevada a t (eixo-ângulo; t pode passar de 1 ou ser negativo). */
export function potQ(q: Quaternion, t: number): Quaternion {
  const qq = q.w < 0 ? new Quaternion(-q.x, -q.y, -q.z, -q.w) : q.clone();
  const s = Math.hypot(qq.x, qq.y, qq.z);
  if (s < 1e-9) return new Quaternion();
  const ang = 2 * Math.atan2(s, qq.w) * t;
  const k = Math.sin(ang / 2) / s;
  return new Quaternion(qq.x * k, qq.y * k, qq.z * k, Math.cos(ang / 2));
}

/** Ângulo (graus) entre duas rotações, sem o erro do acos perto de 1. */
export function anguloQuat(a: Quaternion, b: Quaternion): number {
  const s = a.dot(b) < 0 ? -1 : 1;
  const d = Math.hypot(a.x - s * b.x, a.y - s * b.y, a.z - s * b.z, a.w - s * b.w);
  const m = Math.hypot(a.x + s * b.x, a.y + s * b.y, a.z + s * b.z, a.w + s * b.w);
  return 4 * Math.atan2(d, m) * 180 / Math.PI;
}

// ---- pose média (pra exagerar/suavizar): rotação média e posição média com a tendência (o andar pra frente)
export interface Media { q: Quaternion; p0: Vector3; inc: Vector3; fm: number; temPos: boolean }
const cacheMedia = new WeakMap<AnimationClip, Map<string, Media>>();
export function esquecerClipe(clip: AnimationClip) { cacheMedia.delete(clip); }
export function mediaDoOsso(clip: AnimationClip, osso: string, fps: number, rep: Repouso | undefined): Media {
  let m = cacheMedia.get(clip);
  if (!m) { m = new Map(); cacheMedia.set(clip, m); }
  const ja = m.get(osso);
  if (ja) return ja;
  const n = Math.max(1, Math.round(clip.duration * fps));
  const soma = new Quaternion(0, 0, 0, 0);
  let ref: Quaternion | null = null;
  const ps: Vector3[] = [];
  for (let f = 0; f <= n; f++) {
    const v = valorOriginal(clip, osso, Math.min(clip.duration, f / fps), rep);
    if (ref && ref.dot(v.q) < 0) v.q.set(-v.q.x, -v.q.y, -v.q.z, -v.q.w);
    ref ||= v.q.clone();
    soma.set(soma.x + v.q.x, soma.y + v.q.y, soma.z + v.q.z, soma.w + v.q.w);
    ps.push(v.p);
  }
  soma.normalize();
  // reta dos mínimos quadrados em cada eixo: p(f) ≈ p0 + inc × (f − fm)
  const fm = n / 2;
  const p0 = ps.reduce((a, b) => a.add(b), new Vector3()).multiplyScalar(1 / ps.length);
  const inc = new Vector3();
  let den = 0;
  ps.forEach((p, f) => { inc.addScaledVector(p.clone().sub(p0), f - fm); den += (f - fm) ** 2; });
  if (den > 0) inc.multiplyScalar(1 / den);
  const r: Media = { q: soma, p0, inc, fm, temPos: !!trilha(clip, osso, 'position') };
  m.set(osso, r);
  return r;
}
