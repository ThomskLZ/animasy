// Árvore dos ossos (pra rig que não é gente, dedos, rabo...) com busca.
import { esc } from './dialogo';

export interface NoArvore { nome: string; rotulo: string; extra?: string; pai: string | null }

export class Arvore {
  private fechados = new Set<string>();
  constructor(private el: HTMLElement, private busca: HTMLInputElement, private escolher: (n: string) => void) {
    busca.addEventListener('input', () => this.desenhar(this.ultimo));
  }
  private ultimo: { nos: NoArvore[]; sel: string | null; ajustados: Set<string> } = { nos: [], sel: null, ajustados: new Set() };

  desenhar(e: { nos: NoArvore[]; sel: string | null; ajustados: Set<string> }) {
    this.ultimo = e;
    const filtro = this.busca.value.trim().toLowerCase();
    const filhos = new Map<string | null, NoArvore[]>();
    for (const n of e.nos) { const l = filhos.get(n.pai) || []; l.push(n); filhos.set(n.pai, l); }
    const nomes = new Set(e.nos.map((n) => n.nome));
    const raizes = e.nos.filter((n) => !n.pai || !nomes.has(n.pai));
    const bate = (n: NoArvore) => !filtro || n.rotulo.toLowerCase().includes(filtro) || (n.extra || '').toLowerCase().includes(filtro);
    const temBate = (n: NoArvore): boolean => bate(n) || (filhos.get(n.nome) || []).some(temBate);
    const linhas: string[] = [];
    const vai = (n: NoArvore, d: number) => {
      if (filtro && !temBate(n)) return;
      const fs = filhos.get(n.nome) || [];
      const fechado = !filtro && this.fechados.has(n.nome);
      const cls = (n.nome === e.sel ? ' sel' : '') + (e.ajustados.has(n.nome) ? ' aj' : '') + (filtro && !bate(n) ? ' apagado' : '');
      linhas.push(`<div class="no${cls}" data-n="${esc(n.nome)}" style="padding-left:${4 + d * 12}px">` +
        `<span class="seta">${fs.length ? (fechado ? '▸' : '▾') : ''}</span><span class="rot">${esc(n.rotulo)}</span>` +
        (n.extra ? `<span class="extra">${esc(n.extra)}</span>` : '') + '</div>');
      if (!fechado) for (const f of fs) vai(f, d + 1);
    };
    for (const r of raizes) vai(r, 0);
    this.el.innerHTML = linhas.join('') || '<div class="vazio-lista">Nada com esse nome.</div>';
    for (const div of this.el.querySelectorAll<HTMLElement>('.no')) {
      const n = div.dataset.n!;
      div.querySelector('.seta')!.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this.fechados.has(n)) this.fechados.delete(n); else this.fechados.add(n);
        this.desenhar(this.ultimo);
      });
      div.addEventListener('click', () => this.escolher(n));
    }
    this.el.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
}
