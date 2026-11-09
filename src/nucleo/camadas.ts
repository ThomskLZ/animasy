// Camadas de ajuste: cada animação tem uma pilha de camadas, cada uma com peso (0-100%) e liga/desliga.
//   ajuste:  chaves por osso (a camada de ajuste de sempre)
//   exagero: multiplica o movimento em volta da pose média (fator 1 = igual, 1,5 = 50% a mais, 0,5 = metade)
// Conta: rotação final = original × D1 × D2 × ...; posição final = original + P1 + P2 + ...
import { AnimationClip, Quaternion, Vector3 } from 'three';
import { AjustesClip, evalPos, evalRot, limparAjustes } from './ajustes';
import { MapaRepouso, mediaDoOsso, ossosDoClipe, potQ, valorOriginal } from './clipe';

interface Base { id: string; nome: string; peso: number; ligada: boolean }
export interface CamadaAjuste extends Base { tipo: 'ajuste'; ajustes: AjustesClip }
export interface CamadaExagero extends Base { tipo: 'exagero'; fatores: Record<string, number> }   // '*' = corpo todo
export type Camada = CamadaAjuste | CamadaExagero;

export interface Contexto { clip: AnimationClip; fps: number; rep: MapaRepouso }

export const novaCamada = (id: string, nome = 'Ajustes'): CamadaAjuste => ({ id, nome, peso: 1, ligada: true, tipo: 'ajuste', ajustes: {} });
const conta = (c: Camada) => c.ligada && c.peso > 1e-4;

/** Ossos que a camada mexe. */
export function ossosDaCamada(c: Camada, clip: AnimationClip): string[] {
  if (c.tipo === 'ajuste') return Object.keys(c.ajustes);
  const nomes = Object.keys(c.fatores).filter((o) => o !== '*');
  if (c.fatores['*'] !== undefined) for (const o of ossosDoClipe(clip)) if (!nomes.includes(o)) nomes.push(o);
  return nomes;
}
export function ossosMexidos(camadas: Camada[], clip: AnimationClip): Set<string> {
  const s = new Set<string>();
  for (const c of camadas) if (conta(c)) for (const o of ossosDaCamada(c, clip)) s.add(o);
  return s;
}
export function temAjuste(camadas: Camada[]): boolean {
  return camadas.some((c) => (c.tipo === 'ajuste' ? Object.keys(c.ajustes).length > 0 : Object.keys(c.fatores).length > 0));
}
export function limparCamadas(camadas: Camada[]) {
  for (const c of camadas) {
    if (c.tipo === 'ajuste') limparAjustes(c.ajustes);
    else for (const k of Object.keys(c.fatores)) if (Math.abs(c.fatores[k] - 1) < 1e-4) delete c.fatores[k];
  }
}

/** Parte de UMA camada num osso/quadro (sem peso). */
function parte(c: Camada, ctx: Contexto, osso: string, f: number): { q?: Quaternion; p?: Vector3 } {
  if (c.tipo === 'ajuste') {
    const a = c.ajustes[osso];
    if (!a) return {};
    return { q: a.rot ? evalRot(a.rot, f) : undefined, p: a.pos ? evalPos(a.pos, f) : undefined };
  }
  const k = c.fatores[osso] ?? c.fatores['*'];
  if (k === undefined || Math.abs(k - 1) < 1e-6) return {};
  const rep = ctx.rep.get(osso);
  const t = Math.min(ctx.clip.duration, f / ctx.fps);
  const o = valorOriginal(ctx.clip, osso, t, rep);
  const m = mediaDoOsso(ctx.clip, osso, ctx.fps, rep);
  // o × E = m × (m⁻¹ o)^k  →  E = o⁻¹ m (m⁻¹ o)^k
  const d = m.q.clone().invert().multiply(o.q);
  const q = o.q.clone().invert().multiply(m.q).multiply(potQ(d, k));
  let p: Vector3 | undefined;
  if (m.temPos) {
    const ref = m.p0.clone().addScaledVector(m.inc, f - m.fm);
    p = o.p.clone().sub(ref).multiplyScalar(k - 1);
  }
  return { q, p };
}

/** Soma das camadas [de, ate) num osso/quadro, com peso. */
export function deltaCamadas(camadas: Camada[], ctx: Contexto, osso: string, f: number, de = 0, ate = camadas.length) {
  const q = new Quaternion(), p = new Vector3();
  let tem = false;
  for (let i = de; i < ate; i++) {
    const c = camadas[i];
    if (!conta(c)) continue;
    const r = parte(c, ctx, osso, f);
    if (r.q) { q.multiply(c.peso >= 0.9999 ? r.q : potQ(r.q, c.peso)); tem = true; }
    if (r.p) { p.addScaledVector(r.p, c.peso); tem = true; }
  }
  return { q, p, tem };
}

/**
 * O que a camada `i` precisa valer (sem peso) pra o osso chegar no valor final pedido.
 * final = orig × antes × L^w × depois  →  L = ((orig × antes)⁻¹ × final × depois⁻¹)^(1/w)
 */
export function resolverCamada(camadas: Camada[], i: number, ctx: Contexto, osso: string, f: number) {
  const antes = deltaCamadas(camadas, ctx, osso, f, 0, i);
  const depois = deltaCamadas(camadas, ctx, osso, f, i + 1);
  const w = Math.max(1e-3, camadas[i].peso);
  return {
    rot: (orig: Quaternion, final: Quaternion) => {
      const l = orig.clone().multiply(antes.q).invert().multiply(final).multiply(depois.q.clone().invert());
      return w >= 0.9999 ? l : potQ(l, 1 / w);
    },
    pos: (orig: Vector3, final: Vector3) => final.clone().sub(orig).sub(antes.p).sub(depois.p).multiplyScalar(1 / w),
  };
}
