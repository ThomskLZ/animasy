// Encaixes de acessório: pontos onde dá pra prender uma espada, escudo, chapéu...
//   - nó vazio preso num osso (Socket_*, *socket*, *attach*, *grip*, *prop*, ou qualquer nó sem malha filho de osso)
//   - malha rígida presa num osso só (malha comum filha de osso, ou skinned com todo o peso num osso)
import { Bone, Mesh, Object3D, SkinnedMesh } from 'three';

export interface Encaixe { no: Object3D; nome: string; osso: string; tipo: 'encaixe' | 'malha' }

const NOME_ENCAIXE = /(socket|attach|grip|prop|slot|mount|holder|weapon|encaixe)/i;
const PONTA_OSSO = /([._ -]?end|[._ -]tip|nub|[._ -]null|[._ -]leaf|_head_?end)$/i;   // ponta de osso que o exportador cria
const ehOsso = (o: Object3D | null): o is Bone => !!o && (o as Bone).isBone;
function ossoAcima(o: Object3D): Bone | null {
  for (let p = o.parent; p; p = p.parent) if (ehOsso(p)) return p;
  return null;
}
function temMalha(o: Object3D) {
  let tem = false;
  o.traverse((x) => { if ((x as Mesh).isMesh) tem = true; });
  return tem;
}
/** Osso único que manda na malha skinned (todo o peso nele), ou null. */
function ossoUnico(s: SkinnedMesh): string | null {
  const idx = s.geometry.getAttribute('skinIndex'), wt = s.geometry.getAttribute('skinWeight');
  if (!idx || !wt) return null;
  let unico = -1;
  for (let v = 0; v < idx.count; v++) for (let k = 0; k < 4; k++) {
    if (wt.getComponent(v, k) < 0.01) continue;
    const i = idx.getComponent(v, k);
    if (unico === -1) unico = i;
    else if (unico !== i) return null;
  }
  return unico >= 0 ? s.skeleton.bones[unico]?.name ?? null : null;
}

export function acharEncaixes(root: Object3D, nomeOriginal: (o: Object3D) => string): Encaixe[] {
  const r: Encaixe[] = [];
  root.traverse((o) => {
    if (ehOsso(o) || o.userData.animasyAcessorio) return;
    const osso = ossoAcima(o);
    const m = o as Mesh;
    if (m.isMesh) {
      if ((m as SkinnedMesh).isSkinnedMesh) {
        const u = ossoUnico(m as SkinnedMesh);
        if (u) r.push({ no: o, nome: nomeOriginal(o), osso: u, tipo: 'malha' });
      } else if (osso && ehOsso(o.parent)) r.push({ no: o, nome: nomeOriginal(o), osso: osso.name, tipo: 'malha' });
      return;
    }
    if (!osso) return;
    const nome = nomeOriginal(o);
    if (NOME_ENCAIXE.test(nome) || (ehOsso(o.parent) && !temMalha(o) && !PONTA_OSSO.test(nome) && o.children.length === 0 && !ehPontaVazia(o))) r.push({ no: o, nome, osso: osso.name, tipo: 'encaixe' });
  });
  // corpo feito de peças rígidas (robô, boneco articulado): as peças são o corpo, não acessório
  const rigidas = r.filter((e) => e.tipo === 'malha');
  if (rigidas.length > 4) for (const e of rigidas) r.splice(r.indexOf(e), 1);
  // encaixes antes das malhas; não repete malhas que estão dentro de um encaixe
  const dentro = (o: Object3D) => r.some((e) => e.tipo === 'encaixe' && e.no !== o && isDescendente(e.no, o));
  return r.filter((e) => e.tipo === 'encaixe' || !dentro(e.no)).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'encaixe' ? -1 : 1));
}
/** Nó vazio sem nome de encaixe só conta se tiver transform próprio (ponta de osso costuma ser só translação ao longo do osso). */
function ehPontaVazia(o: Object3D) {
  return !o.parent || o.parent.children.filter((c) => !ehOsso(c)).length === 1 && o.quaternion.angleTo(o.quaternion.clone().identity()) < 1e-4 && /end|tip/i.test(o.name);
}
function isDescendente(a: Object3D, b: Object3D) {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}
