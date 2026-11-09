// Pose a pose: a animação vira uma lista de poses-chave; entre elas, a interpolação de cada pose
// (suave, linear, constante, ease in, ease out). O clipe é gerado a partir das poses (uma chave por quadro).
import { AnimationClip, KeyframeTrack, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { curva } from './ajustes';
import { anguloQuat } from './clipe';

/** v[osso] = [qx, qy, qz, qw] ou [qx, qy, qz, qw, px, py, pz] */
export interface PoseChave { f: number; i: number; v: Record<string, number[]> }

export type Amostra = (f: number) => Map<string, { q: Quaternion; p: Vector3 }>;

/**
 * Escolhe as poses-chave: começa com o primeiro e o último quadro e vai acrescentando o quadro que a
 * interpolação suave mais erra (soma dos ângulos de todos os ossos), até ter `maximo` poses ou o erro
 * ficar abaixo de `tolGraus`.
 */
export function detectarPoses(amostra: Amostra, n: number, maximo: number, tolGraus = 2): number[] {
  const quadros: Map<string, { q: Quaternion; p: Vector3 }>[] = [];
  for (let f = 0; f <= n; f++) quadros.push(amostra(f));
  const ossos = [...quadros[0].keys()];
  const escolhidos = [0, n];
  const erro = (f: number, a: number, b: number) => {
    const u = curva((f - a) / Math.max(1, b - a), 0);
    let e = 0;
    for (const o of ossos) {
      const qa = quadros[a].get(o)!.q, qb = quadros[b].get(o)!.q;
      e += anguloQuat(qa.clone().slerp(qb, u), quadros[f].get(o)!.q);
    }
    return e;
  };
  // candidatas primeiro: os extremos do movimento (quadros onde a pose quase para: velocidade mínima)
  const vel = (f: number) => { let v = 0; for (const o of ossos) v += anguloQuat(quadros[Math.max(0, f - 1)].get(o)!.q, quadros[Math.min(n, f + 1)].get(o)!.q); return v; };
  const vs = quadros.map((_, f) => vel(f));
  const extremos = new Set<number>();
  for (let f = 1; f < n; f++) if (vs[f] <= vs[f - 1] && vs[f] <= vs[f + 1] && vs[f] < Math.max(vs[f - 1], vs[f + 1]) + 1e-9) extremos.add(f);
  while (escolhidos.length < Math.min(maximo, n + 1)) {
    let pior = -1, pe = tolGraus;
    for (const so of [true, false]) {
      for (let k = 0; k < escolhidos.length - 1; k++) {
        const a = escolhidos[k], b = escolhidos[k + 1];
        for (let f = a + 1; f < b; f++) { if (so && !extremos.has(f)) continue; const e = erro(f, a, b); if (e > pe) { pe = e; pior = f; } }
      }
      if (pior >= 0) break;
    }
    if (pior < 0) break;
    escolhidos.push(pior);
    escolhidos.sort((x, y) => x - y);
  }
  return escolhidos;
}

/** Valor de um osso no quadro f a partir das poses. */
export function valorPoses(poses: PoseChave[], osso: string, f: number): { q: Quaternion; p?: Vector3 } | null {
  const lista = poses.filter((p) => p.v[osso]);
  if (!lista.length) return null;
  const val = (p: PoseChave) => { const v = p.v[osso]; return { q: new Quaternion(v[0], v[1], v[2], v[3]), p: v.length > 4 ? new Vector3(v[4], v[5], v[6]) : undefined }; };
  if (f <= lista[0].f) return val(lista[0]);
  for (let k = 0; k < lista.length - 1; k++) {
    const a = lista[k], b = lista[k + 1];
    if (f < b.f) {
      const u = curva((f - a.f) / Math.max(1e-6, b.f - a.f), a.i);
      const va = val(a), vb = val(b);
      if (va.q.dot(vb.q) < 0) vb.q.set(-vb.q.x, -vb.q.y, -vb.q.z, -vb.q.w);
      return { q: va.q.slerp(vb.q, u), p: va.p && vb.p ? va.p.lerp(vb.p, u) : va.p };
    }
  }
  return val(lista[lista.length - 1]);
}

/** Gera o clipe (uma chave por quadro, todos os ossos das poses). */
export function gerarClipePoses(nome: string, duracao: number, fps: number, poses: PoseChave[]): AnimationClip {
  const n = Math.max(1, Math.round(duracao * fps));
  const ossos = new Set<string>();
  for (const p of poses) for (const o of Object.keys(p.v)) ossos.add(o);
  const tempos = Array.from({ length: n + 1 }, (_, f) => Math.min(duracao, f / fps));
  const tracks: KeyframeTrack[] = [];
  for (const o of ossos) {
    const vq: number[] = [], vp: number[] = [];
    let temPos = false, ant: Quaternion | null = null;
    for (let f = 0; f <= n; f++) {
      const v = valorPoses(poses, o, f)!;
      if (ant && ant.dot(v.q) < 0) v.q.set(-v.q.x, -v.q.y, -v.q.z, -v.q.w);
      ant = v.q;
      vq.push(v.q.x, v.q.y, v.q.z, v.q.w);
      if (v.p) { temPos = true; vp.push(v.p.x, v.p.y, v.p.z); }
    }
    tracks.push(new QuaternionKeyframeTrack(`${o}.quaternion`, tempos, vq));
    if (temPos && vp.length === vq.length / 4 * 3) tracks.push(new VectorKeyframeTrack(`${o}.position`, tempos, vp));
  }
  return new AnimationClip(nome, duracao, tracks);
}

/** Atualiza no lugar as trilhas de alguns ossos (enquanto arrasta: sem trocar o clipe no mixer). */
export function atualizarTrilhas(clip: AnimationClip, poses: PoseChave[], ossos: string[], fps: number) {
  for (const o of ossos) {
    const tq = clip.tracks.find((t) => t.name === `${o}.quaternion`);
    const tp = clip.tracks.find((t) => t.name === `${o}.position`);
    if (!tq) continue;
    let ant: Quaternion | null = null;
    for (let k = 0; k < tq.times.length; k++) {
      const v = valorPoses(poses, o, Math.round(tq.times[k] * fps));
      if (!v) continue;
      if (ant && ant.dot(v.q) < 0) v.q.set(-v.q.x, -v.q.y, -v.q.z, -v.q.w);
      ant = v.q;
      tq.values.set([v.q.x, v.q.y, v.q.z, v.q.w], k * 4);
      if (tp && v.p) tp.values.set([v.p.x, v.p.y, v.p.z], k * 3);
    }
  }
}
