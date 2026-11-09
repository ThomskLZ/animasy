import { describe, expect, it } from 'vitest';
import { AnimationClip, Bone, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { AjustesClip, definirInterp, escreverChave, evalRot, moverChave, prepararChave } from '../src/nucleo/ajustes';
import { anguloQuat, assarClip, compararClipes, MapaRepouso, valorAjustado } from '../src/nucleo/assar';
import { Camada, CamadaAjuste, deltaCamadas, novaCamada, resolverCamada } from '../src/nucleo/camadas';
import { apontar, curvarCadeia, moverMeio, resolverIK } from '../src/nucleo/ik';
import { mapaRot, paresEspelho } from '../src/nucleo/espelho';
import { detectarPoses, gerarClipePoses } from '../src/nucleo/poses';
import { remapaTrecho, retimeClip } from '../src/nucleo/tempo';
import { potQ } from '../src/nucleo/clipe';

const qz = (graus: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), graus * Math.PI / 180);
const qx = (graus: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), graus * Math.PI / 180);
const ang = anguloQuat;
const M = (raio: number) => ({ tipo: 'momento' as const, raio });
const TUDO = { tipo: 'tudo' as const };
const k = (f: number, q: Quaternion) => [f, q.x, q.y, q.z, q.w] as [number, number, number, number, number];

describe('camada de ajuste', () => {
  it('momento: cria bordas e entra/sai suave', () => {
    const aj: AjustesClip = {};
    const c = prepararChave(aj, 'braco', 'rot', 10, M(4), 30);
    escreverChave(c, qz(40), 10);
    expect(aj.braco.rot!.map((x) => x[0])).toEqual([6, 10, 14]);
    expect(ang(evalRot(aj.braco.rot, 10), qz(40))).toBeLessThan(1e-4);
    expect(ang(evalRot(aj.braco.rot, 6), new Quaternion())).toBeLessThan(1e-4);
    expect(ang(evalRot(aj.braco.rot, 8), qz(20))).toBeLessThan(1e-3);      // smoothstep no meio = metade
    expect(ang(evalRot(aj.braco.rot, 0), new Quaternion())).toBeLessThan(1e-4);
  });
  it('inteira: desloca todas as chaves', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 10, M(4), 30), qz(40), 10);
    escreverChave(prepararChave(aj, 'b', 'rot', 10, TUDO, 30), qz(50), 10);
    expect(ang(evalRot(aj.b.rot, 10), qz(50))).toBeLessThan(1e-3);
    expect(ang(evalRot(aj.b.rot, 0), qz(10))).toBeLessThan(1e-3);
  });
  it('trecho: cheio dentro, zero longe, rampa nas pontas', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 12, { tipo: 'trecho', a: 10, b: 20, raio: 4 }, 30), qz(30), 12);
    for (const f of [10, 12, 15, 20]) expect(ang(evalRot(aj.b.rot, f), qz(30))).toBeLessThan(1e-3);
    for (const f of [0, 5, 6, 24, 30]) expect(ang(evalRot(aj.b.rot, f), new Quaternion())).toBeLessThan(1e-3);
    expect(ang(evalRot(aj.b.rot, 8), qz(15))).toBeLessThan(1e-3);
  });
  it('interpolação por chave', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 10, M(10), 30), qz(40), 10);   // chaves 0, 10, 20
    expect(ang(evalRot(aj.b.rot, 5), qz(20))).toBeLessThan(1e-3);               // suave: metade no meio
    definirInterp(aj, ['b'], 0, 2);                                             // constante
    expect(ang(evalRot(aj.b.rot, 9), new Quaternion())).toBeLessThan(1e-3);
    expect(ang(evalRot(aj.b.rot, 10), qz(40))).toBeLessThan(1e-3);
    definirInterp(aj, ['b'], 0, 1);                                             // linear
    expect(ang(evalRot(aj.b.rot, 2.5), qz(10))).toBeLessThan(1e-3);
    definirInterp(aj, ['b'], 0, 3);                                             // ease in: u²
    expect(ang(evalRot(aj.b.rot, 5), qz(10))).toBeLessThan(1e-3);
    definirInterp(aj, ['b'], 0, 4);                                             // ease out
    expect(ang(evalRot(aj.b.rot, 5), qz(30))).toBeLessThan(1e-3);
  });
  it('mover chave no tempo', () => {
    const aj: AjustesClip = {};
    escreverChave(prepararChave(aj, 'b', 'rot', 10, M(4), 30), qz(40), 10);
    expect(moverChave(aj, ['b'], 10, 12)).toBe(true);
    expect(moverChave(aj, ['b'], 12, 14)).toBe(false);     // já tem chave no 14
    expect(aj.b.rot!.map((x) => x[0])).toEqual([6, 12, 14]);
  });
});

const clip = new AnimationClip('Teste', 1, [new QuaternionKeyframeTrack('b.quaternion', [0, 0.5, 1], [...qz(0).toArray(), ...qz(60).toArray(), ...qz(0).toArray()])]);
const rep: MapaRepouso = new Map([['b', { q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1) }]]);
const ctx = { clip, fps: 30, rep };

describe('camadas', () => {
  it('peso e liga/desliga', () => {
    const c = novaCamada('1');
    c.ajustes.b = { rot: [k(0, qz(40))] };
    const cs: Camada[] = [c];
    expect(ang(deltaCamadas(cs, ctx, 'b', 10).q, qz(40))).toBeLessThan(1e-3);
    c.peso = 0.5;
    expect(ang(deltaCamadas(cs, ctx, 'b', 10).q, qz(20))).toBeLessThan(1e-3);
    c.ligada = false;
    expect(ang(deltaCamadas(cs, ctx, 'b', 10).q, new Quaternion())).toBeLessThan(1e-4);
  });
  it('exagero: dobra o movimento em volta da média', () => {
    const cs: Camada[] = [{ id: 'e', nome: 'Exagero', peso: 1, ligada: true, tipo: 'exagero', fatores: { '*': 2 } }];
    // média ≈ 30°; no pico (60°) vira 30 + 2 × 30 = 90°
    const v = valorAjustado(clip, cs, 'b', 0.5, 30, rep.get('b'), rep);
    expect(ang(v.q, qz(90))).toBeLessThan(1.5);
    const v0 = valorAjustado(clip, cs, 'b', 0, 30, rep.get('b'), rep);
    expect(ang(v0.q, qz(-30))).toBeLessThan(1.5);
  });
  it('resolver a camada ativa com outras em volta', () => {
    const a = novaCamada('a'), b = novaCamada('b') as CamadaAjuste, d = novaCamada('d');
    a.ajustes.b = { rot: [k(0, qz(10))] };
    d.ajustes.b = { rot: [k(0, qx(25))] };
    b.peso = 0.4;
    const cs: Camada[] = [a, b, d];
    const orig = qz(60), final = qz(60).multiply(qx(-15)).multiply(qz(33));
    const L = resolverCamada(cs, 1, ctx, 'b', 10).rot(orig, final);
    b.ajustes.b = { rot: [k(0, L)] };
    expect(ang(orig.clone().multiply(deltaCamadas(cs, ctx, 'b', 10).q), final)).toBeLessThan(1e-3);
  });
  it('o clipe assado bate com o editor em todo quadro (com exagero e camadas)', () => {
    const c = novaCamada('1');
    escreverChave(prepararChave(c.ajustes, 'b', 'rot', 15, M(6), 30), qz(-30), 15);
    const cs: Camada[] = [c, { id: 'e', nome: 'Exagero', peso: 0.7, ligada: true, tipo: 'exagero', fatores: { b: 1.6 } }];
    const novo = assarClip(clip, cs, 30, rep);
    const r = compararClipes([{ clip, camadas: cs, fps: 30 }], [novo], rep, rep, (o) => o);
    expect(r.graus).toBeLessThan(1e-3);
    expect(r.faltando).toEqual([]);
  });
  it('acusa diferença quando não bate', () => {
    const c = novaCamada('1');
    c.ajustes.b = { rot: [k(0, qz(10))] };
    const r = compararClipes([{ clip, camadas: [c], fps: 30 }], [clip], rep, rep, (o) => o);
    expect(r.graus).toBeGreaterThan(9);
  });
  it('potência de rotação', () => {
    expect(ang(potQ(qz(40), 1.5), qz(60))).toBeLessThan(1e-3);
    expect(ang(potQ(qz(40), -0.5), qz(-20))).toBeLessThan(1e-3);
  });
});

function braco() {
  const A = new Bone(), B = new Bone(), C = new Bone();
  A.add(B); B.add(C);
  B.position.set(0, -1, 0.05); C.position.set(0, -1, -0.05);
  A.updateMatrixWorld(true);
  return [A, B, C];
}
const wp = (o: Bone) => o.getWorldPosition(new Vector3());

describe('IK e mover junta', () => {
  it('leva a ponta até o alvo alcançável', () => {
    const [A, B, C] = braco();
    const alvo = new Vector3(0.6, -1.2, 0.3);
    resolverIK(A, B, C, alvo, new Vector3(0, 0, 1));
    expect(wp(C).distanceTo(alvo)).toBeLessThan(1e-4);
  });
  it('cotovelo vai pro lado do alvo com a mão parada', () => {
    const [A, B, C] = braco();
    resolverIK(A, B, C, new Vector3(0, -1.4, 0.3), new Vector3(0, 0, 1));
    const mao = wp(C), qMao = C.getWorldQuaternion(new Quaternion());
    moverMeio(A, B, C, new Vector3(1, -0.7, 0), new Vector3(0, 0, 1));
    expect(wp(C).distanceTo(mao)).toBeLessThan(1e-4);
    expect(ang(C.getWorldQuaternion(new Quaternion()), qMao)).toBeLessThan(1e-3);
    expect(wp(B).x).toBeGreaterThan(0.5);                   // o cotovelo foi pro lado do alvo
    expect(wp(B).distanceTo(wp(A))).toBeCloseTo(Math.hypot(1, 0.05), 4);   // comprimento igual
  });
  it('apontar e curvar a coluna', () => {
    const ossos = [new Bone(), new Bone(), new Bone(), new Bone()];
    for (let i = 1; i < 4; i++) { ossos[i - 1].add(ossos[i]); ossos[i].position.set(0, 0.3, 0); }
    ossos[0].updateMatrixWorld(true);
    const alvo = new Vector3(0.35, 0.75, 0.1);
    curvarCadeia(ossos.slice(0, 3), ossos[3], alvo);
    expect(wp(ossos[3]).distanceTo(alvo)).toBeLessThan(0.02);
    // a curva fica dividida: nenhuma vértebra leva tudo
    const giros = ossos.slice(0, 3).map((o) => ang(o.quaternion, new Quaternion()));
    expect(Math.max(...giros)).toBeLessThan(giros.reduce((a, b) => a + b) * 0.7);
    const [A, B] = braco();
    apontar(A, B, new Vector3(1, 0, 0));
    expect(wp(B).normalize().distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-4);
  });
});

describe('espelho', () => {
  it('pares pelo nome e pela posição', () => {
    const o = (nome: string, x: number, prof = 1) => ({ nome, original: nome, pos: new Vector3(x, 1, 0), prof });
    const p = paresEspelho([o('Hand.L', 0.5), o('Hand.R', -0.5), o('ShoulderL', 0.2), o('ShoulderR', -0.2), o('Spine', 0), o('Osso1', 0.3, 3), o('Osso2', -0.3, 3)], 0.01);
    expect(p.get('Hand.L')).toBe('Hand.R');
    expect(p.get('ShoulderR')).toBe('ShoulderL');
    expect(p.get('Spine')).toBe('Spine');
    expect(p.get('Osso1')).toBe('Osso2');
  });
  it('ajuste espelhado vira o mesmo movimento do outro lado', () => {
    const RWs = new Quaternion(0.2, 0.4, -0.3, 0.84).normalize();
    const RWt = new Quaternion(RWs.x, -RWs.y, -RWs.z, RWs.w);
    const d = qx(30).multiply(qz(20));
    const dt = mapaRot(RWs, RWt)(d);
    const ws = RWs.clone().multiply(d), wt = RWt.clone().multiply(dt);
    expect(ang(new Quaternion(ws.x, -ws.y, -ws.z, ws.w), wt)).toBeLessThan(1e-3);
  });
});

describe('pose a pose e tempo', () => {
  it('acha as poses extremas e o clipe gerado passa por elas', () => {
    const amostra = (f: number) => new Map([['b', { q: qz(60 * Math.sin(Math.PI * 2 * f / 30)), p: new Vector3() }]]);
    const fs = detectarPoses(amostra, 30, 5);
    expect(fs).toEqual(expect.arrayContaining([0, 30]));
    expect(fs.some((f) => Math.abs(f - 7.5) <= 1)).toBe(true);    // pico
    expect(fs.some((f) => Math.abs(f - 22.5) <= 1)).toBe(true);   // vale
    const poses = fs.map((f) => ({ f, i: 0, v: { b: amostra(f).get('b')!.q.toArray() } }));
    const c = gerarClipePoses('P', 1, 30, poses);
    for (const f of fs) expect(ang(valorAjustado(c, [], 'b', f / 30, 30, rep.get('b')).q, amostra(f).get('b')!.q)).toBeLessThan(1e-3);
  });
  it('esticar um trecho', () => {
    const g = remapaTrecho(0.25, 0.5, 2);
    const c = retimeClip(clip, g, g(1));
    expect(c.duration).toBeCloseTo(1.25, 5);
    expect(ang(valorAjustado(c, [], 'b', 0.75, 30, rep.get('b')).q, qz(60))).toBeLessThan(1e-3);  // o pico (0,5 s) foi pra 0,75 s
  });
});
