import { describe, expect, it } from 'vitest';
import { AnimationClip, Bone, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { AjustesClip, escreverChave, evalRot, moverChave, prepararChave } from '../src/nucleo/ajustes';
import { anguloQuat, assarClip, compararClipes, MapaRepouso, valorAjustado } from '../src/nucleo/assar';
import { resolverIK } from '../src/nucleo/ik';

const qz = (graus: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), graus * Math.PI / 180);
const ang = anguloQuat;

describe('camada de ajuste', () => {
  it('momento: cria bordas e entra/sai suave', () => {
    const aj: AjustesClip = {};
    const c = prepararChave(aj, 'braco', 'rot', 10, false, 4, 30);
    escreverChave(c, qz(40), 10, false);
    expect(aj.braco.rot!.map((k) => k[0])).toEqual([6, 10, 14]);
    expect(ang(evalRot(aj.braco.rot, 10), qz(40))).toBeLessThan(1e-4);
    expect(ang(evalRot(aj.braco.rot, 6), new Quaternion())).toBeLessThan(1e-4);
    expect(ang(evalRot(aj.braco.rot, 8), qz(20))).toBeLessThan(1e-3);      // smoothstep no meio = metade
    expect(ang(evalRot(aj.braco.rot, 0), new Quaternion())).toBeLessThan(1e-4);
  });
  it('inteira: desloca todas as chaves', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 10, false, 4, 30), qz(40), 10, false);
    escreverChave(prepararChave(aj, 'b', 'rot', 10, true, 4, 30), qz(50), 10, true);
    expect(ang(evalRot(aj.b.rot, 10), qz(50))).toBeLessThan(1e-3);
    expect(ang(evalRot(aj.b.rot, 0), qz(10))).toBeLessThan(1e-3);
  });
  it('mover chave no tempo', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 10, false, 4, 30), qz(40), 10, false);
    expect(moverChave(aj, ['b'], 10, 12)).toBe(true);
    expect(moverChave(aj, ['b'], 12, 14)).toBe(false);     // já tem chave no 14
    expect(aj.b.rot!.map((k) => k[0])).toEqual([6, 12, 14]);
  });
});

describe('assar', () => {
  const clip = new AnimationClip('Teste', 1, [new QuaternionKeyframeTrack('b.quaternion', [0, 1], [...qz(0).toArray(), ...qz(90).toArray()])]);
  const rep: MapaRepouso = new Map([['b', { q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1) }]]);
  it('o clipe assado bate com o editor em todo quadro', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 15, false, 6, 30), qz(-30), 15, false);
    const novo = assarClip(clip, aj, 30, rep);
    const r = compararClipes([{ clip, aj }], [novo], 30, rep, rep, (o) => o);
    expect(r.graus).toBeLessThan(1e-4);
    expect(r.faltando).toEqual([]);
    const v = valorAjustado(clip, aj, 'b', 0.5, 30, rep.get('b'));
    expect(ang(v.q, qz(15))).toBeLessThan(1e-3);
  });
  it('acusa diferença quando não bate', () => {
    const r = compararClipes([{ clip, aj: { b: { rot: [[0, ...qz(10).toArray()] as [number, number, number, number, number]] } } }], [clip], 30, rep, rep, (o) => o);
    expect(r.graus).toBeGreaterThan(9);
  });
});

describe('IK de 2 ossos', () => {
  it('leva a ponta até o alvo alcançável', () => {
    const A = new Bone(), B = new Bone(), C = new Bone();
    A.add(B); B.add(C);
    B.position.set(0, -1, 0); C.position.set(0, -1, 0.01);
    A.updateMatrixWorld(true);
    const alvo = new Vector3(0.6, -1.2, 0.3);
    resolverIK(A, B, C, alvo, new Vector3(0, 0, 1));
    expect(C.getWorldPosition(new Vector3()).distanceTo(alvo)).toBeLessThan(1e-4);
  });
});
