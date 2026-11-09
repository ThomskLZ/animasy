// Camada de ajuste: o que a pessoa mexe fica POR CIMA da animação original, sem tocar nela até salvar.
// ajustes[osso] = { rot: [[quadro, x, y, z, w, interp?]...], pos: [[quadro, x, y, z, interp?]...] }
//   rot = rotação extra no espaço do osso (pose nova = pose original × ajuste)
//   pos = deslocamento extra (somado à posição original)
// A interpolação de uma chave vale do quadro dela até a próxima chave (como no Blender).
// Antes da primeira e depois da última chave, segura o valor.
import { Quaternion, Vector3 } from 'three';

export type ChaveRot = [number, number, number, number, number, number?];
export type ChavePos = [number, number, number, number, number?];
export type Chave = ChaveRot | ChavePos;
export interface AjusteOsso { rot?: ChaveRot[]; pos?: ChavePos[] }
export type AjustesClip = Record<string, AjusteOsso>;
export type TipoChave = 'rot' | 'pos';

/** Interpolações: 0 suave, 1 linear, 2 constante, 3 ease in (começa devagar), 4 ease out (termina devagar). */
export const INTERP = ['suave', 'linear', 'constante', 'ease in', 'ease out'] as const;
export type Interp = 0 | 1 | 2 | 3 | 4;
export const NOME_INTERP = ['Suave', 'Linear', 'Constante', 'Ease in', 'Ease out'];

export const smooth = (u: number) => u * u * (3 - 2 * u);
export function curva(u: number, i: number | undefined): number {
  switch (i) {
    case 1: return u;
    case 2: return 0;
    case 3: return u * u;
    case 4: return 1 - (1 - u) * (1 - u);
    default: return smooth(u);
  }
}
const QI = new Quaternion();
const iRot = (k: ChaveRot) => k[5];
const iPos = (k: ChavePos) => k[4];

export function evalRot(keys: ChaveRot[] | undefined, f: number): Quaternion {
  const q = (k: ChaveRot) => new Quaternion(k[1], k[2], k[3], k[4]).normalize();
  if (!keys || !keys.length) return QI.clone();
  if (f <= keys[0][0]) return q(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f < b[0]) {
      const u = (f - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return q(a).slerp(q(b), curva(Math.min(1, u), iRot(a)));
    }
  }
  return q(keys[keys.length - 1]);
}

export function evalPos(keys: ChavePos[] | undefined, f: number): Vector3 {
  const p = (k: ChavePos) => new Vector3(k[1], k[2], k[3]);
  if (!keys || !keys.length) return new Vector3();
  if (f <= keys[0][0]) return p(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f < b[0]) {
      const u = (f - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return p(a).lerp(p(b), curva(Math.min(1, u), iPos(a)));
    }
  }
  return p(keys[keys.length - 1]);
}

export const qArr = (f: number, q: Quaternion, i?: number): ChaveRot => (i ? [f, q.x, q.y, q.z, q.w, i] : [f, q.x, q.y, q.z, q.w]);
export const pArr = (f: number, p: Vector3, i?: number): ChavePos => (i ? [f, p.x, p.y, p.z, i] : [f, p.x, p.y, p.z]);
export const ehZeroRot = (k: ChaveRot) => Math.abs(Math.abs(k[4]) - 1) < 1e-6;
export const ehZeroPos = (k: ChavePos) => Math.hypot(k[1], k[2], k[3]) < 1e-6;
const interpDe = (k: Chave, t: TipoChave) => (t === 'rot' ? (k as ChaveRot)[5] : (k as ChavePos)[4]);

/** Tira chaves e ossos que não mudam nada. Devolve true se não sobrou ajuste nenhum. */
export function limparAjustes(aj: AjustesClip): boolean {
  for (const b of Object.keys(aj)) {
    if (aj[b].rot && (!aj[b].rot!.length || aj[b].rot!.every(ehZeroRot))) delete aj[b].rot;
    if (aj[b].pos && (!aj[b].pos!.length || aj[b].pos!.every(ehZeroPos))) delete aj[b].pos;
    if (!aj[b].rot && !aj[b].pos) delete aj[b];
  }
  return Object.keys(aj).length === 0;
}

/** Até onde o ajuste vale. */
export type Escopo =
  | { tipo: 'momento'; raio: number }                     // entra e sai suave em volta do quadro
  | { tipo: 'tudo' }                                      // a animação inteira
  | { tipo: 'trecho'; a: number; b: number; raio: number }; // cheio de a até b, rampa de `raio` quadros nas pontas

/** Peso do deslocamento em cada quadro (tudo/trecho). */
export function pesoEscopo(e: Escopo, f: number): number {
  if (e.tipo === 'tudo') return 1;
  if (e.tipo === 'momento') return f === 0 ? 1 : 0;
  if (f >= e.a && f <= e.b) return 1;
  const r = Math.max(1, e.raio);
  if (f < e.a) return f <= e.a - r ? 0 : smooth((f - (e.a - r)) / r);
  return f >= e.b + r ? 0 : smooth(((e.b + r) - f) / r);
}

export interface ChaveEmEdicao {
  nome: string;
  tipo: TipoChave;
  L: Chave[];
  escopo: Escopo;
  inicio?: Chave[];
  val0?: Quaternion | Vector3;
  pesoF?: number;
  interp?: number;
}

function potQ(q: Quaternion, t: number): Quaternion {
  return new Quaternion().slerp(q, t);
}

/**
 * Prepara a(s) chave(s) do quadro `f` antes de arrastar.
 * momento: cria chaves de borda a `raio` quadros (com o valor de agora), pro ajuste entrar e sair suave.
 * tudo/trecho: guarda as chaves de antes (mais chaves novas nos pontos de virada); o arrasto vira um deslocamento
 * aplicado com o peso do escopo em cada chave.
 */
export function prepararChave(aj: AjustesClip, nome: string, tipo: TipoChave, f: number, escopo: Escopo,
  nQuadros: number, interpNova?: number): ChaveEmEdicao {
  const B = (aj[nome] ||= {});
  const L = ((B[tipo] as Chave[] | undefined) ||= []) as Chave[];
  const ev = (q: number) => (tipo === 'rot' ? evalRot(L as ChaveRot[], q) : evalPos(L as ChavePos[], q));
  const arr = (q: number, v: Quaternion | Vector3, i?: number): Chave => (tipo === 'rot' ? qArr(q, v as Quaternion, i) : pArr(q, v as Vector3, i));
  const interpEm = (q: number) => {           // a chave nova herda a interpolação do trecho onde cai
    let i: number | undefined = interpNova;
    for (const k of L) if (k[0] <= q) i = interpDe(k, tipo) ?? interpNova;
    return i;
  };
  if (escopo.tipo !== 'momento') {
    const pontos = new Set<number>();
    if (escopo.tipo === 'tudo') { if (!L.length) pontos.add(f); }
    else {
      const r = Math.max(1, Math.round(escopo.raio));
      for (const q of [escopo.a - r, escopo.a, escopo.b, escopo.b + r, f]) if (q >= 0 && q <= nQuadros) pontos.add(Math.round(q));
    }
    for (const q of pontos) if (!L.some((k) => k[0] === q)) L.push(arr(q, ev(q), interpEm(q)));
    L.sort((a, b) => a[0] - b[0]);
    return { nome, tipo, L, escopo, inicio: L.map((k) => k.slice() as Chave), val0: ev(f), pesoF: Math.max(1e-3, pesoEscopo(escopo, f)) };
  }
  if (!L.some((k) => k[0] === f)) {
    const r = Math.max(1, Math.round(escopo.raio));
    const novas: Chave[] = [];
    const fa = Math.max(0, f - r), fb = Math.min(nQuadros, f + r);
    if (fa < f && !L.some((k) => k[0] >= fa && k[0] < f)) novas.push(arr(fa, ev(fa), interpEm(fa)));
    if (fb > f && !L.some((k) => k[0] > f && k[0] <= fb)) novas.push(arr(fb, ev(fb), interpEm(fb)));
    novas.push(arr(f, ev(f), interpEm(f)));
    L.push(...novas);
    L.sort((a, b) => a[0] - b[0]);
  }
  return { nome, tipo, L, escopo };
}

/** Escreve o valor novo (rotação extra / deslocamento extra no quadro f) na chave preparada. */
export function escreverChave(c: ChaveEmEdicao, valor: Quaternion | Vector3, f: number) {
  const e = c.escopo;
  if (e.tipo !== 'momento') {
    const inicio = c.inicio || [];
    const w = (q: number) => pesoEscopo(e, q) / c.pesoF!;
    c.L.length = 0;
    if (c.tipo === 'rot') {
      const C = (c.val0 as Quaternion).clone().invert().multiply(valor as Quaternion);
      for (const k of inicio as ChaveRot[]) {
        const wk = e.tipo === 'tudo' ? 1 : w(k[0]);
        c.L.push(qArr(k[0], new Quaternion(k[1], k[2], k[3], k[4]).multiply(potQ(C, wk)), k[5]));
      }
    } else {
      const C = (valor as Vector3).clone().sub(c.val0 as Vector3);
      for (const k of inicio as ChavePos[]) {
        const wk = e.tipo === 'tudo' ? 1 : w(k[0]);
        c.L.push(pArr(k[0], new Vector3(k[1], k[2], k[3]).addScaledVector(C, wk), k[4]));
      }
    }
  } else {
    const i = c.L.findIndex((k) => k[0] === f);
    const it = interpDe(c.L[i], c.tipo);
    c.L[i] = c.tipo === 'rot' ? qArr(f, valor as Quaternion, it) : pArr(f, valor as Vector3, it);
  }
}

/** Quadros com chave dos ossos da lista. Valor true = só chaves "sem ajuste" (bordas do momento). */
export function chavesPorQuadro(aj: AjustesClip, ossos: string[]): Map<number, boolean> {
  const m = new Map<number, boolean>();
  for (const n of ossos) {
    for (const k of aj[n]?.rot || []) m.set(k[0], (m.get(k[0]) ?? true) && ehZeroRot(k));
    for (const k of aj[n]?.pos || []) m.set(k[0], (m.get(k[0]) ?? true) && ehZeroPos(k));
  }
  return m;
}

/** Move as chaves dos ossos da lista do quadro `de` pro `para`. Falha se já houver chave lá. */
export function moverChave(aj: AjustesClip, ossos: string[], de: number, para: number): boolean {
  if (de === para) return true;
  for (const n of ossos) for (const t of ['rot', 'pos'] as const) if ((aj[n]?.[t] as Chave[] | undefined)?.some((k) => k[0] === para)) return false;
  for (const n of ossos) for (const t of ['rot', 'pos'] as const) {
    const L = aj[n]?.[t] as Chave[] | undefined;
    if (!L) continue;
    for (const k of L) if (k[0] === de) k[0] = para;
    L.sort((a, b) => a[0] - b[0]);
  }
  return true;
}

/** Tira as chaves do quadro `f` dos ossos da lista. */
export function tirarChave(aj: AjustesClip, ossos: string[], f: number) {
  for (const n of ossos) {
    const B = aj[n];
    if (!B) continue;
    if (B.rot) B.rot = B.rot.filter((k) => k[0] !== f);
    if (B.pos) B.pos = B.pos.filter((k) => k[0] !== f);
  }
}

/** Interpolação da chave no quadro f (dos ossos da lista); undefined se não houver chave lá. */
export function interpNoQuadro(aj: AjustesClip, ossos: string[], f: number): number | undefined {
  for (const n of ossos) for (const t of ['rot', 'pos'] as const) {
    const k = (aj[n]?.[t] as Chave[] | undefined)?.find((x) => x[0] === f);
    if (k) return interpDe(k, t) ?? 0;
  }
  return undefined;
}

/** Muda a interpolação das chaves do quadro f. Devolve quantas mudou. */
export function definirInterp(aj: AjustesClip, ossos: string[], f: number, i: number): number {
  let n = 0;
  for (const o of ossos) {
    for (const k of aj[o]?.rot || []) if (k[0] === f) { if (i) k[5] = i; else k.length = 5; n++; }
    for (const k of aj[o]?.pos || []) if (k[0] === f) { if (i) k[4] = i; else k.length = 4; n++; }
  }
  return n;
}

/** Muda os quadros das chaves por uma função (esticar / encurtar o tempo). Chaves que caem no mesmo quadro se fundem. */
export function remapearChaves(aj: AjustesClip, g: (f: number) => number) {
  for (const o of Object.keys(aj)) for (const t of ['rot', 'pos'] as const) {
    const L = aj[o][t] as Chave[] | undefined;
    if (!L) continue;
    const vistos = new Set<number>();
    const novas: Chave[] = [];
    for (const k of L) {
      const f = Math.round(g(k[0]));
      if (vistos.has(f)) continue;
      vistos.add(f);
      const c = k.slice() as Chave;
      c[0] = f;
      novas.push(c);
    }
    (aj[o] as Record<string, Chave[]>)[t] = novas.sort((a, b) => a[0] - b[0]);
  }
}
