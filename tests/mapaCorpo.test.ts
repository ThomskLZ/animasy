import { describe, expect, it } from 'vitest';
import { analisarNome, mapaAutomatico, OssoInfo } from '../src/nucleo/mapaCorpo';

// monta uma lista de ossos a partir de pares [nome, pai]
const ossos = (pares: [string, string | null][]): OssoInfo[] => pares.map(([nome, pai]) => ({ nome, pai }));
const corpo = (pre: string, nomes: Record<string, string>, lados: [string, string]) => {
  const [L, R] = lados;
  const n = (k: string, s = '') => pre + nomes[k].replace('%', s);
  const lista: [string, string | null][] = [[n('hips'), null], [n('spine'), n('hips')], [n('chest'), n('spine')],
    [n('neck'), n('chest')], [n('head'), n('neck')]];
  for (const s of [L, R]) {
    lista.push([n('shoulder', s), n('chest')], [n('upperarm', s), n('shoulder', s)], [n('lowerarm', s), n('upperarm', s)],
      [n('hand', s), n('lowerarm', s)], [n('finger', s), n('hand', s)], [n('thigh', s), n('hips')], [n('calf', s), n('thigh', s)],
      [n('foot', s), n('calf', s)], [n('toe', s), n('foot', s)]);
  }
  return ossos(lista);
};

describe('analisarNome', () => {
  it('acha o lado em vários padrões', () => {
    expect(analisarNome('Hand.L').lado).toBe('L');
    expect(analisarNome('LowerLeg.R').lado).toBe('R');
    expect(analisarNome('mixamorig:LeftForeArm')).toEqual({ lado: 'L', base: 'forearm' });
    expect(analisarNome('upperarm_r')).toEqual({ lado: 'R', base: 'upperarm' });
    expect(analisarNome('J_Bip_L_UpperArm')).toEqual({ lado: 'L', base: 'upperarm' });
    expect(analisarNome('DEF-upper_arm.L.001').lado).toBe('L');
    expect(analisarNome('Hips').lado).toBe(null);
    expect(analisarNome('LeftHand').lado).toBe('L');
  });
});

describe('mapaAutomatico', () => {
  it('Mixamo', () => {
    const m = mapaAutomatico(corpo('mixamorig:', { hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
      shoulder: '%Shoulder', upperarm: '%Arm', lowerarm: '%ForeArm', hand: '%Hand', finger: '%HandIndex1', thigh: '%UpLeg',
      calf: '%Leg', foot: '%Foot', toe: '%ToeBase' }, ['Left', 'Right']));
    expect(m).toMatchObject({ quadril: 'mixamorig:Hips', peito: 'mixamorig:Spine2', 'braco.L': 'mixamorig:LeftArm',
      'antebraco.R': 'mixamorig:RightForeArm', 'mao.L': 'mixamorig:LeftHand', 'coxa.R': 'mixamorig:RightUpLeg',
      'canela.L': 'mixamorig:LeftLeg', 'pe.R': 'mixamorig:RightFoot', 'dedos.L': 'mixamorig:LeftToeBase', cabeca: 'mixamorig:Head' });
  });
  it('Unreal', () => {
    const m = mapaAutomatico(corpo('', { hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', neck: 'neck_01', head: 'head',
      shoulder: 'clavicle%', upperarm: 'upperarm%', lowerarm: 'lowerarm%', hand: 'hand%', finger: 'index_01%', thigh: 'thigh%',
      calf: 'calf%', foot: 'foot%', toe: 'ball%' }, ['_l', '_r']));
    expect(m).toMatchObject({ quadril: 'pelvis', barriga: 'spine_01', peito: 'spine_03', 'ombro.L': 'clavicle_l',
      'mao.R': 'hand_r', 'canela.L': 'calf_l', 'dedos.R': 'ball_r' });
  });
  it('Rigify (DEF)', () => {
    const m = mapaAutomatico(ossos([['DEF-spine', null], ['DEF-spine.001', 'DEF-spine'], ['DEF-spine.002', 'DEF-spine.001'],
      ['DEF-spine.003', 'DEF-spine.002'], ['DEF-spine.004', 'DEF-spine.003'], ['DEF-spine.005', 'DEF-spine.004'],
      ['DEF-spine.006', 'DEF-spine.005'], ['DEF-upper_arm.L', 'DEF-spine.003'], ['DEF-upper_arm.L.001', 'DEF-upper_arm.L'],
      ['DEF-forearm.L', 'DEF-upper_arm.L.001'], ['DEF-hand.L', 'DEF-forearm.L'], ['DEF-thigh.R', 'DEF-spine'],
      ['DEF-shin.R', 'DEF-thigh.R'], ['DEF-foot.R', 'DEF-shin.R']]));
    expect(m).toMatchObject({ quadril: 'DEF-spine', peito: 'DEF-spine.003', pescoco: 'DEF-spine.004', cabeca: 'DEF-spine.006',
      'braco.L': 'DEF-upper_arm.L', 'antebraco.L': 'DEF-forearm.L', 'mao.L': 'DEF-hand.L', 'coxa.R': 'DEF-thigh.R', 'pe.R': 'DEF-foot.R' });
  });
  it('VRM (nomes J_Bip)', () => {
    const m = mapaAutomatico(corpo('J_Bip_', { hips: 'C_Hips', spine: 'C_Spine', chest: 'C_Chest', neck: 'C_Neck', head: 'C_Head',
      shoulder: '%_Shoulder', upperarm: '%_UpperArm', lowerarm: '%_LowerArm', hand: '%_Hand', finger: '%_Index1', thigh: '%_UpperLeg',
      calf: '%_LowerLeg', foot: '%_Foot', toe: '%_ToeBase' }, ['L', 'R']));
    expect(m).toMatchObject({ quadril: 'J_Bip_C_Hips', peito: 'J_Bip_C_Chest', 'mao.L': 'J_Bip_L_Hand', 'canela.R': 'J_Bip_R_LowerLeg' });
  });
  it('Blender padrão com lado pela posição quando o nome não diz', () => {
    const m = mapaAutomatico([{ nome: 'hips', pai: null }, { nome: 'arm_a', pai: 'hips', x: 0.3 }, { nome: 'arm_b', pai: 'hips', x: -0.3 }]);
    expect(m['braco.L']).toBe('arm_a');
    expect(m['braco.R']).toBe('arm_b');
  });
});
