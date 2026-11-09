// Boneco clicável (de frente): cada junta é um ponto. A direita do personagem fica à esquerda da tela.
import { nomeSlot, Slot } from '../nucleo/mapaCorpo';

const P: Record<Slot, [number, number]> = {
  cabeca: [80, 31], pescoco: [80, 56], peito: [80, 80], barriga: [80, 106], quadril: [80, 130],
  'ombro.R': [64, 64], 'ombro.L': [96, 64], 'braco.R': [48, 70], 'braco.L': [112, 70],
  'antebraco.R': [39, 104], 'antebraco.L': [121, 104], 'mao.R': [33, 136], 'mao.L': [127, 136],
  'coxa.R': [68, 140], 'coxa.L': [92, 140], 'canela.R': [65, 186], 'canela.L': [95, 186],
  'pe.R': [63, 226], 'pe.L': [97, 226], 'dedos.R': [55, 240], 'dedos.L': [105, 240],
};
const OSSOS: [Slot, Slot][] = [
  ['pescoco', 'peito'], ['peito', 'barriga'], ['barriga', 'quadril'],
  ['peito', 'ombro.R'], ['ombro.R', 'braco.R'], ['braco.R', 'antebraco.R'], ['antebraco.R', 'mao.R'],
  ['peito', 'ombro.L'], ['ombro.L', 'braco.L'], ['braco.L', 'antebraco.L'], ['antebraco.L', 'mao.L'],
  ['quadril', 'coxa.R'], ['coxa.R', 'canela.R'], ['canela.R', 'pe.R'], ['pe.R', 'dedos.R'],
  ['quadril', 'coxa.L'], ['coxa.L', 'canela.L'], ['canela.L', 'pe.L'], ['pe.L', 'dedos.L'],
];

export interface EstadoSilhueta {
  mapa: Partial<Record<Slot, string>>;
  sel: string | null;
  emEdicao: Set<string>;
  ajustados: Set<string>;
  nomeOsso: (n: string) => string;
}

export function desenharSilhueta(el: HTMLElement, e: EstadoSilhueta, escolher: (osso: string) => void, associar: (s: Slot) => void) {
  const linhas = OSSOS.map(([a, b]) => `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`).join('');
  const pontos = (Object.keys(P) as Slot[]).map((s) => {
    const n = e.mapa[s];
    const [x, y] = P[s];
    const cls = !n ? 'falta' : n === e.sel ? 'sel' : e.emEdicao.has(n) ? 'ed' : '';
    const aj = n && e.ajustados.has(n) ? ' aj' : '';
    const titulo = n ? `${nomeSlot(s)} · ${e.nomeOsso(n)}` : `${nomeSlot(s)}: nenhum osso (clique pra escolher)`;
    return `<g class="junta ${cls}${aj}" data-slot="${s}"><title>${titulo}</title><circle class="alvo" cx="${x}" cy="${y}" r="11"/><circle class="pt" cx="${x}" cy="${y}" r="${s === 'cabeca' ? 6.5 : 5}"/></g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 160 252" role="img" aria-label="Corpo: clique numa junta">
    <text x="6" y="12" class="lado">direita</text><text x="154" y="12" class="lado" text-anchor="end">esquerda</text>
    <g class="corpo-forma"><ellipse cx="80" cy="31" rx="17" ry="19"/>
      <path d="M62 62 Q80 54 98 62 L94 118 Q80 124 66 118 Z"/><path d="M66 120 Q80 114 94 120 L96 146 Q80 152 64 146 Z"/></g>
    <g class="ligas">${linhas}</g>${pontos}</svg>`;
  for (const g of el.querySelectorAll<SVGGElement>('.junta')) {
    g.addEventListener('click', () => {
      const s = g.dataset.slot as Slot;
      const n = e.mapa[s];
      if (n) escolher(n); else associar(s);
    });
  }
}
