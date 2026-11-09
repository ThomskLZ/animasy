// Retarget simples: leva a animação de um modelo pra outro pela ORIENTAÇÃO de mundo dos ossos mapeados
// (mapa do corpo dos dois) e pela proporção da altura do quadril. Uma animação por vez, sempre com prévia.
// Conta por osso: mundo_destino = (mundo_origem_na_pose × mundo_origem_no_repouso⁻¹) × mundo_destino_no_repouso;
// local = mundo do pai (já retargetado) ⁻¹ × mundo_destino. Ossos sem par ficam no repouso local.
import { AnimationClip, Bone, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';

export interface LadoRetarget {
  root: Object3D;
  bones: Record<string, Bone>;
  mapa: Record<string, string>;      // slot → nome do osso (nome do three)
  repouso: Map<string, { q: Quaternion; p: Vector3 }>;   // pose local de repouso por osso
  mundoRep?: Map<string, Quaternion>;                    // rotação de mundo no repouso, relativa à raiz do modelo
}

/** Rotação de mundo (relativa a `root`) de cada osso no repouso; nós que não são osso entram com a rotação atual. */
export function mundoRepousoTodos(root: Object3D, repouso: Map<string, { q: Quaternion; p: Vector3 }>): Map<string, Quaternion> {
  const r = new Map<string, Quaternion>();
  const vai = (o: Object3D, pai: Quaternion) => {
    const isB = (o as Bone).isBone && repouso.has(o.name);
    const q = pai.clone().multiply(isB ? repouso.get(o.name)!.q : o.quaternion);
    if (isB && !r.has(o.name)) r.set(o.name, q);
    for (const c of o.children) vai(c, q);
  };
  for (const c of root.children) vai(c, new Quaternion());
  return r;
}

export function alturaQuadril(l: LadoRetarget): number {
  const h = l.bones[l.mapa.quadril];
  if (!h) return 1;
  l.root.updateMatrixWorld(true);
  const y0 = new Box().min(l.root);
  return Math.max(1e-3, h.getWorldPosition(new Vector3()).y - y0);
}
class Box { min(root: Object3D) { let m = Infinity; root.traverse((o) => { const x = o as Bone; if (x.isBone) m = Math.min(m, x.getWorldPosition(new Vector3()).y); }); return Number.isFinite(m) ? Math.min(0, m) : 0; } }

/**
 * @param amostraOrigem põe a origem no tempo t (segundos) e atualiza as matrizes
 * @returns clipe pro destino (uma chave por quadro) e quantos ossos foram levados
 */
export function retargetar(origem: LadoRetarget, destino: LadoRetarget, amostraOrigem: (t: number) => void,
  duracao: number, fps: number, nome: string): { clip: AnimationClip; ossos: number } {
  const slots = Object.keys(destino.mapa).filter((s) => origem.mapa[s] && origem.bones[origem.mapa[s]] && destino.bones[destino.mapa[s]]);
  const cacheO = new Map<string, Quaternion>(), cacheD = new Map<string, Quaternion>();
  void cacheO; void cacheD;
  const mO = origem.mundoRep ?? mundoRepousoTodos(origem.root, origem.repouso), mD = destino.mundoRep ?? mundoRepousoTodos(destino.root, destino.repouso);
  const rO = new Map(slots.map((s) => [s, mO.get(origem.mapa[s])!]));
  const rD = new Map(slots.map((s) => [s, mD.get(destino.mapa[s])!]));
  const qRaizO = origem.root.getWorldQuaternion(new Quaternion()).invert();
  const n = Math.max(1, Math.round(duracao * fps));
  const tempos = Array.from({ length: n + 1 }, (_, f) => Math.min(duracao, f / fps));
  const porSlot = new Map(slots.map((s) => [destino.mapa[s], s]));
  // ordem: pais antes dos filhos
  const ordem = Object.keys(destino.bones).filter((b) => porSlot.has(b));
  const vq = new Map<string, number[]>(ordem.map((b) => [b, []]));
  const vp: number[] = [];
  const escala = alturaQuadril(destino) / alturaQuadril(origem);
  const quad = destino.mapa.quadril, quadO = origem.bones[origem.mapa.quadril];
  amostraOrigem(0);
  const p0 = quadO ? quadO.position.clone() : new Vector3();
  for (const t of tempos) {
    amostraOrigem(t);
    const mundoD = new Map<string, Quaternion>();
    const paiMundo = (b: Bone): Quaternion => {
      if (b.parent && (b.parent as Bone).isBone) return mundoDe(b.parent.name);
      const q = mD.get(b.name)!.clone().multiply(destino.repouso.get(b.name)!.q.clone().invert());   // mundo do pai não-osso
      return q;
    };
    const mundoDe = (nomeB: string): Quaternion => {
      const ja = mundoD.get(nomeB);
      if (ja) return ja;
      const b = destino.bones[nomeB];
      return paiMundo(b).clone().multiply(destino.repouso.get(nomeB)!.q);
    };
    for (const nomeB of ordem) {
      const s = porSlot.get(nomeB)!;
      const bo = origem.bones[origem.mapa[s]];
      const wO = qRaizO.clone().multiply(bo.getWorldQuaternion(new Quaternion()));
      const delta = wO.multiply(rO.get(s)!.clone().invert());
      const wD = delta.multiply(rD.get(s)!);
      const b = destino.bones[nomeB];
      const local = paiMundo(b).clone().invert().multiply(wD);
      mundoD.set(nomeB, wD);
      vq.get(nomeB)!.push(local.x, local.y, local.z, local.w);
    }
    if (quad && quadO) {
      const d = quadO.position.clone().sub(p0).multiplyScalar(escala);
      const p = destino.repouso.get(quad)!.p.clone().add(d);
      vp.push(p.x, p.y, p.z);
    }
  }
  const tracks = ordem.map((b) => new QuaternionKeyframeTrack(`${b}.quaternion`, tempos, vq.get(b)!));
  if (quad && vp.length) tracks.push(new VectorKeyframeTrack(`${quad}.position`, tempos, vp));
  return { clip: new AnimationClip(nome, duracao, tracks), ossos: ordem.length };
}
