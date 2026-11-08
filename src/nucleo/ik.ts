// IK de 2 ossos: leva a ponta (pulso/tornozelo) até o alvo, com o cotovelo/joelho no mesmo plano de antes
// e a mão/pé sem girar no mundo. Serve pra qualquer cadeia A → (...) → B → (...) → C em que A é ancestral de B
// e B é ancestral de C.
import { MathUtils, Object3D, Quaternion, Vector3 } from 'three';

const wpos = (o: Object3D) => o.getWorldPosition(new Vector3());
const wquat = (o: Object3D) => o.getWorldQuaternion(new Quaternion());

/** Gira o osso `o` no mundo por `q` (q × rotação de mundo atual), escrevendo na rotação local. */
function girarNoMundo(o: Object3D, q: Quaternion) {
  const novo = q.clone().multiply(wquat(o));
  const pai = o.parent ? wquat(o.parent) : new Quaternion();
  o.quaternion.copy(pai.invert().multiply(novo));
  o.updateMatrixWorld(true);
}

/**
 * @param poleReserva direção (mundo) pra onde o meio dobra se a cadeia estiver totalmente esticada.
 */
export function resolverIK(A: Object3D, B: Object3D, C: Object3D, alvo: Vector3, poleReserva: Vector3) {
  A.updateWorldMatrix(true, true);
  const S = wpos(A), E = wpos(B), W = wpos(C);
  const qC = wquat(C);
  const L1 = E.distanceTo(S), L2 = W.distanceTo(E);
  if (L1 < 1e-6 || L2 < 1e-6) return;
  const d0 = alvo.clone().sub(S);
  const d = MathUtils.clamp(d0.length(), Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.999);
  const u = d0.lengthSq() > 1e-10 ? d0.normalize() : W.clone().sub(S).normalize();
  const sw = W.clone().sub(S).normalize();
  const pole = E.clone().sub(S);
  pole.sub(sw.clone().multiplyScalar(pole.dot(sw)));
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

export function ehAncestral(a: Object3D, b: Object3D): boolean {
  for (let o = b.parent; o; o = o.parent) if (o === a) return true;
  return false;
}
