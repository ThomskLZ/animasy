// IK e "mover" por junta: leva um ponto do esqueleto até o alvo girando os ossos certos.
//   resolverIK:   2 ossos (braço/perna). A ponta vai pro alvo; o meio fica no plano de antes (ou no pole pedido).
//   moverMeio:    cotovelo/joelho: gira a cadeia em volta da linha ombro→mão, com a mão parada no mundo.
//   apontar:      gira um osso em volta da base dele pra um ponto (filho) ir pro alvo.
//   curvarCadeia: várias vértebras dividem a curva pra levar a ponta ao alvo.
import { MathUtils, Object3D, Quaternion, Vector3 } from 'three';

const wpos = (o: Object3D) => o.getWorldPosition(new Vector3());
const wquat = (o: Object3D) => o.getWorldQuaternion(new Quaternion());

/** Gira o osso `o` no mundo por `q` (q × rotação de mundo atual), escrevendo na rotação local. */
export function girarNoMundo(o: Object3D, q: Quaternion) {
  const novo = q.clone().multiply(wquat(o));
  const pai = o.parent ? wquat(o.parent) : new Quaternion();
  o.quaternion.copy(pai.invert().multiply(novo));
  o.updateMatrixWorld(true);
}

/**
 * @param poleReserva direção (mundo) pra onde o meio dobra se a cadeia estiver totalmente esticada.
 * @param poleForcado se vier, o meio dobra pra esse lado (em vez do plano de antes).
 */
export function resolverIK(A: Object3D, B: Object3D, C: Object3D, alvo: Vector3, poleReserva: Vector3, poleForcado?: Vector3) {
  A.updateWorldMatrix(true, true);
  const S = wpos(A), E = wpos(B), W = wpos(C);
  const qC = wquat(C);
  const L1 = E.distanceTo(S), L2 = W.distanceTo(E);
  if (L1 < 1e-6 || L2 < 1e-6) return;
  const d0 = alvo.clone().sub(S);
  const d = MathUtils.clamp(d0.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.999);
  const u = d0.lengthSq() > 1e-10 ? d0.normalize() : W.clone().sub(S).normalize();
  const pole = poleForcado ? poleForcado.clone() : E.clone().sub(S);
  if (!poleForcado) {
    const sw = W.clone().sub(S).normalize();
    pole.sub(sw.clone().multiplyScalar(pole.dot(sw)));
  }
  if (pole.lengthSq() < 1e-8) pole.copy(poleReserva);
  pole.sub(u.clone().multiplyScalar(pole.dot(u)));
  if (pole.lengthSq() < 1e-10) return;
  pole.normalize();
  const a = (L1 * L1 + d * d - L2 * L2) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const E2 = S.clone().add(u.clone().multiplyScalar(a)).add(pole.multiplyScalar(h));
  const T = S.clone().add(u.clone().multiplyScalar(d));
  girarNoMundo(A, new Quaternion().setFromUnitVectors(E.clone().sub(S).normalize(), E2.clone().sub(S).normalize()));
  const E2r = wpos(B), W2 = wpos(C);
  girarNoMundo(B, new Quaternion().setFromUnitVectors(W2.clone().sub(E2r).normalize(), T.clone().sub(E2r).normalize()));
  // a ponta volta pra rotação de mundo de antes
  const pai = C.parent ? wquat(C.parent) : new Quaternion();
  C.quaternion.copy(pai.invert().multiply(qC));
  C.updateMatrixWorld(true);
}

/** Cotovelo/joelho pro lado do alvo, com a mão/pé parados (a cadeia gira em volta da linha ombro→mão). */
export function moverMeio(A: Object3D, B: Object3D, C: Object3D, alvoMeio: Vector3, poleReserva: Vector3) {
  A.updateWorldMatrix(true, true);
  const S = wpos(A), W = wpos(C);
  const eixo = W.clone().sub(S).normalize();
  const pole = alvoMeio.clone().sub(S);
  pole.sub(eixo.clone().multiplyScalar(pole.dot(eixo)));
  if (pole.lengthSq() < 1e-10) return;
  resolverIK(A, B, C, W, poleReserva, pole);
}

/** Gira `osso` (em volta da base dele) pra que o ponto `ponta` (descendente) aponte pro alvo. */
export function apontar(osso: Object3D, ponta: Object3D, alvo: Vector3, fracao = 1) {
  osso.updateWorldMatrix(true, true);
  const base = wpos(osso);
  const de = wpos(ponta).sub(base), para = alvo.clone().sub(base);
  if (de.lengthSq() < 1e-12 || para.lengthSq() < 1e-12) return;
  const q = new Quaternion().setFromUnitVectors(de.normalize(), para.normalize());
  girarNoMundo(osso, fracao >= 1 ? q : new Quaternion().slerp(q, fracao));
}

/**
 * Curva uma cadeia (da base pra ponta) pra levar `ponta` ao alvo, dividindo a curva entre os ossos.
 * A 1ª volta dá 1/(ossos que faltam) do caminho a cada osso; as outras acertam o resto aos poucos.
 */
export function curvarCadeia(cadeia: Object3D[], ponta: Object3D, alvo: Vector3, voltas = 8) {
  for (let v = 0; v < voltas; v++) {
    cadeia.forEach((o, i) => apontar(o, ponta, alvo, v === 0 ? 1 / (cadeia.length - i) : 0.5));
  }
}

export function ehAncestral(a: Object3D, b: Object3D): boolean {
  for (let o = b.parent; o; o = o.parent) if (o === a) return true;
  return false;
}
