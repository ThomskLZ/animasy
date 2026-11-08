// Mapa do corpo: descobre sozinho qual osso é o quadril, o braço, a mão... pelos nomes (Mixamo, Rigify, Unreal,
// VRM, Blender padrão e afins). O que não for reconhecido a pessoa associa uma vez e fica salvo no projeto.

export const SLOTS = [
  'quadril', 'barriga', 'peito', 'pescoco', 'cabeca',
  'ombro.R', 'braco.R', 'antebraco.R', 'mao.R', 'ombro.L', 'braco.L', 'antebraco.L', 'mao.L',
  'coxa.R', 'canela.R', 'pe.R', 'dedos.R', 'coxa.L', 'canela.L', 'pe.L', 'dedos.L',
] as const;
export type Slot = (typeof SLOTS)[number];
export type MapaCorpo = Partial<Record<Slot, string>>;

const NOME_SLOT: Record<string, [string, boolean]> = {   // [nome, feminino]
  quadril: ['Quadril', false], barriga: ['Barriga', true], peito: ['Peito', false], pescoco: ['Pescoço', false],
  cabeca: ['Cabeça', true], ombro: ['Ombro', false], braco: ['Braço', false], antebraco: ['Antebraço', false],
  mao: ['Mão', true], coxa: ['Coxa', true], canela: ['Canela', true], pe: ['Pé', false], dedos: ['Dedos', false],
};
/** "mao.L" → "Mão esquerda"; curto = só "Mão". L = esquerda do personagem. */
export function nomeSlot(s: Slot, curto = false): string {
  const [base, lado] = s.split('.');
  const [n, fem] = NOME_SLOT[base];
  if (curto || !lado) return n;
  return n + (lado === 'L' ? (fem ? ' esquerda' : ' esquerdo') : fem ? ' direita' : ' direito');
}

export interface OssoInfo {
  nome: string;         // nome como está no arquivo
  pai: string | null;   // nome do osso pai (null = raiz do esqueleto)
  x?: number;           // posição X no espaço do modelo (lado, quando o nome não diz)
}

type Lado = 'L' | 'R' | null;

/** Separa o lado do nome e devolve o resto em minúsculas, sem prefixos de programa. */
export function analisarNome(nomeOrig: string): { lado: Lado; base: string } {
  let n = nomeOrig;
  n = n.replace(/^mixamorig\d*[:_]?/i, '').replace(/^(DEF|ORG|MCH|CTRL)[-_]/i, '')
    .replace(/^J_(Bip|Adj|Sec)_/i, '').replace(/^Bip0?1[_ ]?/i, '').replace(/^(Armature|Root)[|:]/i, '');
  let lado: Lado = null;
  const tenta = (re: RegExp, l: Lado) => {
    if (lado) return;
    if (re.test(n)) { lado = l; n = n.replace(re, '_'); }
  };
  tenta(/^L(?=[_ .-]|[A-Z])|(?<=[_ .-])L$|[_ .-]L(?=[_ .-])/, 'L');
  tenta(/^R(?=[_ .-]|[A-Z])|(?<=[_ .-])R$|[_ .-]R(?=[_ .-])/, 'R');
  tenta(/left/i, 'L');
  tenta(/right/i, 'R');
  tenta(/(?<=[_ .-])l$|^l(?=[_ .-])/, 'L');
  tenta(/(?<=[_ .-])r$|^r(?=[_ .-])/, 'R');
  const base = n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { lado, base };
}

const PONTA = /(_end|end$|_tip|tip$|nub|_top|top_end|_null|pole|target|ik$|_ik_|twist|roll|helper|bend|socket|attach|prop|weapon)/;
const DEDO = /(thumb|index|middle|ring|pinky|little|finger|digit|polegar|indicador)/;

type Regra = { slot: string; re: RegExp; lateral: boolean };
const REGRAS: Regra[] = [
  { slot: 'mao', re: /(^|_)(hand|wrist|palm|mao)(_|\d|$)/, lateral: true },
  { slot: 'antebraco', re: /(forearm|lowerarm|lower_arm|lowarm|elbow|antebraco)/, lateral: true },
  { slot: 'braco', re: /(upperarm|upper_arm|uparm|^arm$|^arm_|_arm$|braco)/, lateral: true },
  { slot: 'ombro', re: /(shoulder|clavicle|collar|ombro)/, lateral: true },
  { slot: 'dedos', re: /(toe|ball|dedo)/, lateral: true },
  { slot: 'pe', re: /(^|_)(foot|ankle|pe)(_|\d|$)/, lateral: true },
  { slot: 'canela', re: /(lowerleg|lower_leg|lowleg|shin|calf|knee|canela|^leg$|^leg_|_leg$)/, lateral: true },
  { slot: 'coxa', re: /(upperleg|upper_leg|upleg|thigh|coxa)/, lateral: true },
  { slot: 'cabeca', re: /(^|_)(head|cabeca)(_|\d|$)/, lateral: false },
  { slot: 'pescoco', re: /(neck|pescoco)/, lateral: false },
  { slot: 'quadril', re: /(^|_)(hips?|pelvis|quadril)(_|\d|$)/, lateral: false },
];

/** Mapa automático. Escolhe, pra cada parte, o osso mais perto da raiz que bate com o nome. */
export function mapaAutomatico(ossos: OssoInfo[], vrm?: Record<string, string>): MapaCorpo {
  const mapa: MapaCorpo = {};
  const porNome = new Map(ossos.map((o) => [o.nome, o]));
  const prof = (o: OssoInfo) => { let d = 0; for (let p = o.pai; p && porNome.has(p) && d < 500; p = porNome.get(p)!.pai) d++; return d; };
  const desc = new Map<string, number>();
  for (const o of ossos) for (let p = o.pai; p && porNome.has(p); p = porNome.get(p)!.pai) desc.set(p, (desc.get(p) || 0) + 1);
  const info = ossos.map((o) => ({ o, ...analisarNome(o.nome), d: prof(o) }));
  // VRM traz o mapa pronto (humanBones): usa primeiro
  if (vrm) {
    const V: Record<string, string> = { hips: 'quadril', spine: 'barriga', chest: 'peito', neck: 'pescoco', head: 'cabeca',
      leftShoulder: 'ombro.L', leftUpperArm: 'braco.L', leftLowerArm: 'antebraco.L', leftHand: 'mao.L',
      rightShoulder: 'ombro.R', rightUpperArm: 'braco.R', rightLowerArm: 'antebraco.R', rightHand: 'mao.R',
      leftUpperLeg: 'coxa.L', leftLowerLeg: 'canela.L', leftFoot: 'pe.L', leftToes: 'dedos.L',
      rightUpperLeg: 'coxa.R', rightLowerLeg: 'canela.R', rightFoot: 'pe.R', rightToes: 'dedos.R' };
    for (const [k, s] of Object.entries(V)) if (vrm[k] && porNome.has(vrm[k])) mapa[s as Slot] = vrm[k];
  }
  const usados = new Set(Object.values(mapa));
  for (const r of REGRAS) {
    const cand = info.filter((i) => !usados.has(i.o.nome) && !PONTA.test(i.base) && !DEDO.test(i.base) && r.re.test(i.base));
    for (const lado of r.lateral ? (['L', 'R'] as const) : [null]) {
      const slot = (lado ? `${r.slot}.${lado}` : r.slot) as Slot;
      if (mapa[slot]) continue;
      const c = cand.filter((i) => {
        if (!r.lateral) return i.lado === null;
        const l = i.lado ?? (i.o.x === undefined || Math.abs(i.o.x) < 1e-4 ? null : i.o.x > 0 ? 'L' : 'R');
        return l === lado;
      }).sort((a, b) => a.d - b.d || (desc.get(b.o.nome) || 0) - (desc.get(a.o.nome) || 0) || a.o.nome.localeCompare(b.o.nome));
      if (c.length) { mapa[slot] = c[0].o.nome; usados.add(c[0].o.nome); }
    }
  }
  // Rigify: DEF-spine é o quadril e spine.001/.003/.004/.006 são barriga/peito/pescoço/cabeça
  const rig = (base: string) => info.find((i) => i.lado === null && i.base === base && !usados.has(i.o.nome));
  if (rig('spine_006') && rig('spine_004')) {
    for (const [b, s] of [['spine', 'quadril'], ['spine_001', 'barriga'], ['spine_003', 'peito'], ['spine_004', 'pescoco'], ['spine_006', 'cabeca']] as const) {
      const i = rig(b);
      if (i && !mapa[s]) { mapa[s] = i.o.nome; usados.add(i.o.nome); }
    }
  }
  // Coluna (barriga e peito): ossos do meio entre o quadril e o pescoço
  const ehColuna = (i: (typeof info)[number]) => i.lado === null && !PONTA.test(i.base) && /(spine|chest|torso|abdomen|back|waist|coluna|barriga|peito)/.test(i.base);
  const coluna = info.filter((i) => ehColuna(i) && !usados.has(i.o.nome)).sort((a, b) => a.d - b.d);
  if (!mapa.quadril && coluna.length && /^spine$/.test(coluna[0].base)) {    // Rigify sem "hips"
    mapa.quadril = coluna[0].o.nome; usados.add(coluna[0].o.nome); coluna.shift();
  }
  if (coluna.length) {
    if (!mapa.peito) {
      const peito = coluna.find((i) => /(upper_?chest|chest|torso|peito)/.test(i.base)) || (coluna.length > 1 ? coluna[coluna.length - 1] : undefined);
      if (peito) { mapa.peito = peito.o.nome; usados.add(peito.o.nome); }
    }
    if (!mapa.barriga) {
      const b = coluna.find((i) => !usados.has(i.o.nome));
      if (b) { mapa.barriga = b.o.nome; usados.add(b.o.nome); }
    }
  }
  return mapa;
}

/** Cadeia de IK (braço, antebraço, mão) de uma ponta, se o mapa tiver as três partes. */
export function cadeiaIK(mapa: MapaCorpo, ponta: Slot): [string, string, string] | null {
  const [base, lado] = ponta.split('.');
  const nomes = base === 'mao' ? [`braco.${lado}`, `antebraco.${lado}`, `mao.${lado}`]
    : base === 'pe' ? [`coxa.${lado}`, `canela.${lado}`, `pe.${lado}`] : null;
  if (!nomes) return null;
  const c = nomes.map((s) => mapa[s as Slot]);
  return c.every(Boolean) ? (c as [string, string, string]) : null;
}

/** Ao "mover" uma parte, qual ponta vai junto: braço/antebraço/mão → mão; perna → pé; quadril → o corpo todo. */
export function alvoMover(slot: Slot | undefined): Slot | null {
  if (!slot) return null;
  const [base, lado] = slot.split('.');
  if (['braco', 'antebraco', 'mao'].includes(base)) return `mao.${lado}` as Slot;
  if (['coxa', 'canela', 'pe', 'dedos'].includes(base)) return `pe.${lado}` as Slot;
  if (base === 'quadril') return 'quadril';
  return null;
}
