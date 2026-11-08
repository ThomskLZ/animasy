// Camada de ajuste: o que a pessoa mexe fica POR CIMA da animação original, sem tocar nela até salvar.
// ajustes[osso] = { rot: [[quadro, x, y, z, w]...], pos: [[quadro, x, y, z]...] }
//   rot = rotação extra no espaço do osso (pose nova = pose original × ajuste)
//   pos = deslocamento extra (somado à posição original)
// Entre as chaves: smoothstep; antes da primeira e depois da última, segura o valor.
import { Quaternion, Vector3 } from 'three';

export type ChaveRot = [number, number, number, number, number];
export type ChavePos = [number, number, number, number];
export type Chave = ChaveRot | ChavePos;
export interface AjusteOsso { rot?: ChaveRot[]; pos?: ChavePos[] }
export type AjustesClip = Record<string, AjusteOsso>;
export type TipoChave = 'rot' | 'pos';

export const smooth = (u: number) => u * u * (3 - 2 * u);
const QI = new Quaternion();

export function evalRot(keys: ChaveRot[] | undefined, f: number): Quaternion {
  const q = (k: ChaveRot) => new Quaternion(k[1], k[2], k[3], k[4]).normalize();
  if (!keys || !keys.length) return QI.clone();
  if (f <= keys[0][0]) return q(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f <= b[0]) return q(a).slerp(q(b), smooth((f - a[0]) / Math.max(1e-6, b[0] - a[0])));
  }
  return q(keys[keys.length - 1]);
}

export function evalPos(keys: ChavePos[] | undefined, f: number): Vector3 {
  const p = (k: ChavePos) => new Vector3(k[1], k[2], k[3]);
  if (!keys || !keys.length) return new Vector3();
  if (f <= keys[0][0]) return p(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f <= b[0]) return p(a).lerp(p(b), smooth((f - a[0]) / Math.max(1e-6, b[0] - a[0])));
  }
  return p(keys[keys.length - 1]);
}

export const qArr = (f: number, q: Quaternion): ChaveRot => [f, q.x, q.y, q.z, q.w];
export const pArr = (f: number, p: Vector3): ChavePos => [f, p.x, p.y, p.z];
export const ehZero = (k: Chave) => (k.length === 5 ? Math.abs(Math.abs(k[4]) - 1) < 1e-6 : Math.hypot(k[1], k[2], k[3]) < 1e-6);

/** Tira chaves e ossos que não mudam nada. Devolve true se não sobrou ajuste nenhum. */
export function limparAjustes(aj: AjustesClip): boolean {
  for (const b of Object.keys(aj)) {
    for (const t of ['rot', 'pos'] as const) {
      const L = aj[b][t] as Chave[] | undefined;
      if (L && (!L.length || L.every(ehZero))) delete aj[b][t];
    }
    if (!aj[b].rot && !aj[b].pos) delete aj[b];
  }
  return Object.keys(aj).length === 0;
}

export interface ChaveEmEdicao {
  nome: string;
  tipo: TipoChave;
  L: Chave[];
  inicio?: Chave[];
  val0?: Quaternion | Vector3;
}

/**
 * Prepara a chave do quadro `f` antes de arrastar.
 * Escopo "momento": cria chaves de borda a `raio` quadros (com o valor de agora), pro ajuste entrar e sair suave.
 * Escopo "inteira": guarda as chaves de antes; o arrasto vira um deslocamento aplicado em todas.
 */
export function prepararChave(aj: AjustesClip, nome: string, tipo: TipoChave, f: number, tudo: boolean,
  raio: number, nQuadros: number): ChaveEmEdicao {
  const B = (aj[nome] ||= {});
  const L = ((B[tipo] as Chave[] | undefined) ||= []) as Chave[];
  const ev = (q: number) => (tipo === 'rot' ? evalRot(L as ChaveRot[], q) : evalPos(L as ChavePos[], q));
  const arr = (q: number, v: Quaternion | Vector3): Chave => (tipo === 'rot' ? qArr(q, v as Quaternion) : pArr(q, v as Vector3));
  if (tudo) return { nome, tipo, L, inicio: L.map((k) => k.slice() as Chave), val0: ev(f) };
  if (!L.some((k) => k[0] === f)) {
    const r = Math.max(1, Math.round(raio));
    const novas: Chave[] = [];
    const fa = Math.max(0, f - r), fb = Math.min(nQuadros, f + r);
    if (fa < f && !L.some((k) => k[0] >= fa && k[0] < f)) novas.push(arr(fa, ev(fa)));
    if (fb > f && !L.some((k) => k[0] > f && k[0] <= fb)) novas.push(arr(fb, ev(fb)));
    novas.push(arr(f, ev(f)));
    L.push(...novas);
    L.sort((a, b) => a[0] - b[0]);
  }
  return { nome, tipo, L };
}

/** Escreve o valor novo (rotação extra / deslocamento extra) na chave preparada. */
export function escreverChave(c: ChaveEmEdicao, valor: Quaternion | Vector3, f: number, tudo: boolean) {
  if (tudo) {
    c.L.length = 0;
    const inicio = c.inicio || [];
    if (c.tipo === 'rot') {
      const v = valor as Quaternion;
      const C = (c.val0 as Quaternion).clone().invert().multiply(v);
      if (!inicio.length) c.L.push(qArr(f, v));
      else for (const k of inicio as ChaveRot[]) c.L.push(qArr(k[0], new Quaternion(k[1], k[2], k[3], k[4]).multiply(C)));
    } else {
      const v = valor as Vector3;
      const C = v.clone().sub(c.val0 as Vector3);
      if (!inicio.length) c.L.push(pArr(f, v));
      else for (const k of inicio as ChavePos[]) c.L.push(pArr(k[0], new Vector3(k[1], k[2], k[3]).add(C)));
    }
  } else {
    const i = c.L.findIndex((k) => k[0] === f);
    c.L[i] = c.tipo === 'rot' ? qArr(f, valor as Quaternion) : pArr(f, valor as Vector3);
  }
}

/** Quadros com chave dos ossos da lista. Valor true = só chaves "sem ajuste" (bordas do momento). */
export function chavesPorQuadro(aj: AjustesClip, ossos: string[]): Map<number, boolean> {
  const m = new Map<number, boolean>();
  for (const n of ossos) for (const k of [...(aj[n]?.rot || []), ...(aj[n]?.pos || [])] as Chave[]) {
    m.set(k[0], (m.get(k[0]) ?? true) && ehZero(k));
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
