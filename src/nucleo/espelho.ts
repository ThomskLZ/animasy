// Espelhar esquerda ↔ direita. O espelho é o plano X = 0 do modelo (glTF: X = lado, Y = cima, Z = frente).
// Pares de ossos pelo nome (Hand.L ↔ Hand.R, LeftArm ↔ RightArm, ShoulderL ↔ ShoulderR) e, se o nome não diz,
// pela posição espelhada no repouso.
// Conta (vale pra rig simétrico, em qualquer pose): um ajuste local d no osso s vira, no osso t,
//   d' = RWt⁻¹ · E(RWs · d · RWs⁻¹) · RWt     (RW = rotação de mundo no repouso, E = espelho)
import { Quaternion, Vector3 } from 'three';
import { analisarNome } from './mapaCorpo';

export const espelharQ = (q: Quaternion) => new Quaternion(q.x, -q.y, -q.z, q.w);
export const espelharV = (v: Vector3) => new Vector3(-v.x, v.y, v.z);

export interface OssoEspelho { nome: string; original: string; pos: Vector3; prof: number }

/** Par de cada osso (os do meio apontam pra si mesmos). */
export function paresEspelho(ossos: OssoEspelho[], tolerancia: number): Map<string, string> {
  const pares = new Map<string, string>();
  const info = ossos.map((o) => ({ o, ...analisarNome(o.original) }));
  const porBase = new Map<string, { L?: string; R?: string }>();
  for (const i of info) {
    if (!i.lado) continue;
    const g = porBase.get(i.base) || {};
    g[i.lado] = i.o.nome;
    porBase.set(i.base, g);
  }
  for (const g of porBase.values()) if (g.L && g.R) { pares.set(g.L, g.R); pares.set(g.R, g.L); }
  // sem par pelo nome: procura o osso na posição espelhada (mesma profundidade)
  for (const o of ossos) {
    if (pares.has(o.nome)) continue;
    if (Math.abs(o.pos.x) < tolerancia) { pares.set(o.nome, o.nome); continue; }
    const alvo = espelharV(o.pos);
    let melhor: OssoEspelho | null = null, md = tolerancia;
    for (const x of ossos) {
      if (x === o || x.prof !== o.prof || pares.has(x.nome)) continue;
      const d = x.pos.distanceTo(alvo);
      if (d < md) { md = d; melhor = x; }
    }
    if (melhor) { pares.set(o.nome, melhor.nome); pares.set(melhor.nome, o.nome); }
    else pares.set(o.nome, o.nome);
  }
  return pares;
}

/** Leva um ajuste local de rotação do osso s pro osso t (com RW de repouso dos dois). */
export function mapaRot(RWs: Quaternion, RWt: Quaternion) {
  const RWsi = RWs.clone().invert(), RWti = RWt.clone().invert();
  return (d: Quaternion) => RWti.clone().multiply(espelharQ(RWs.clone().multiply(d).multiply(RWsi))).multiply(RWt).normalize();
}
/** Leva um deslocamento local (no espaço do pai) do osso s pro osso t (RP = rotação de mundo do pai no repouso). */
export function mapaVet(RPs: Quaternion, RPt: Quaternion) {
  const RPti = RPt.clone().invert();
  return (v: Vector3) => espelharV(v.clone().applyQuaternion(RPs)).applyQuaternion(RPti);
}
