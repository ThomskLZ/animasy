// Temas (Gruvbox escuro/claro e o original) e as configurações guardadas no navegador.
export type NomeTema = 'gruvbox-escuro' | 'gruvbox-claro' | 'animasy';

const BASE = ['bg', 'panel', 'panel2', 'panel3', 'borda', 'txt', 'mut', 'acc', 'acc-txt', 'ok', 'erro', 'laranja', 'azul', 'aqua', 'roxo', 'vermelho', 'verde',
  'cena', 'chao1', 'chao2', 'sombra'] as const;
type Cores = Record<(typeof BASE)[number], string>;

export const TEMAS: Record<NomeTema, { nome: string; claro: boolean; cores: Cores }> = {
  'gruvbox-escuro': { nome: 'Gruvbox escuro', claro: false, cores: {
    bg: '#1d2021', panel: '#282828', panel2: '#32302f', panel3: '#3c3836', borda: '#504945', txt: '#ebdbb2', mut: '#a89984',
    acc: '#fabd2f', 'acc-txt': '#1d2021', ok: '#b8bb26', erro: '#fb4934', laranja: '#fe8019', azul: '#83a598', aqua: '#8ec07c',
    roxo: '#d3869b', vermelho: '#fb4934', verde: '#b8bb26', cena: '#2a2827', chao1: '#4a4e3a', chao2: '#545a42', sombra: '#0009' } },
  'gruvbox-claro': { nome: 'Gruvbox claro', claro: true, cores: {
    bg: '#f9f5d7', panel: '#f2e5bc', panel2: '#ebdbb2', panel3: '#d5c4a1', borda: '#bdae93', txt: '#3c3836', mut: '#7c6f64',
    acc: '#b57614', 'acc-txt': '#f9f5d7', ok: '#79740e', erro: '#9d0006', laranja: '#af3a03', azul: '#076678', aqua: '#427b58',
    roxo: '#8f3f71', vermelho: '#cc241d', verde: '#79740e', cena: '#e8dcb5', chao1: '#b9b48a', chao2: '#c6c197', sombra: '#3c383640' } },
  animasy: { nome: 'Animasy (azul)', claro: false, cores: {
    bg: '#1b2030', panel: '#242a3b', panel2: '#2c3347', panel3: '#343c53', borda: '#3a4258', txt: '#e9edf5', mut: '#98a2b8',
    acc: '#f3b94d', 'acc-txt': '#1b2030', ok: '#7ed07a', erro: '#ff7a6b', laranja: '#ff9a5c', azul: '#7fd8ff', aqua: '#7fe0c0',
    roxo: '#c69cff', vermelho: '#ff6b6b', verde: '#7ed07a', cena: '#2a3146', chao1: '#5c7a52', chao2: '#6b8a5f', sombra: '#0008' } },
};

export interface Config {
  tema: NomeTema;
  interp: number;          // interpolação das chaves novas
  snapRot: number;         // graus (0 = livre)
  snapPos: number;         // metros (0 = livre)
  espaco: 'local' | 'mundo';
  avancado: boolean;
  fantasmas: number;       // quantos de cada lado
  passoFantasma: number;   // de quantos em quantos quadros
}
const PADRAO: Config = { tema: 'gruvbox-escuro', interp: 0, snapRot: 0, snapPos: 0, espaco: 'local', avancado: false, fantasmas: 2, passoFantasma: 3 };
const CHAVE = 'animasy.config';

export function lerConfig(): Config {
  try {
    const s = localStorage.getItem(CHAVE);
    const c = s ? { ...PADRAO, ...JSON.parse(s) } : { ...PADRAO };
    if (!TEMAS[c.tema as NomeTema]) c.tema = PADRAO.tema;
    return c;
  } catch { return { ...PADRAO }; }
}
export function salvarConfig(c: Config) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento: vale só nesta aba */ }
}

export function aplicarTema(nome: NomeTema) {
  const t = TEMAS[nome];
  const r = document.documentElement;
  for (const k of BASE) r.style.setProperty(`--${k}`, t.cores[k]);
  r.dataset.theme = t.claro ? 'light' : 'dark';
  r.style.colorScheme = t.claro ? 'light' : 'dark';
}
/** Cor do tema atual (pros canvas e pra cena 3D). */
export const cor = (k: (typeof BASE)[number]) => getComputedStyle(document.documentElement).getPropertyValue(`--${k}`).trim() || '#888';
