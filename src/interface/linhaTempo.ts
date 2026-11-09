// Linha do tempo: régua (arrastar marca um trecho: toca em loop e serve de escopo "Trecho"), cursor e chaves em
// losango (arrastáveis no tempo). Chave constante vira quadrado.
import { cor } from './tema';

export interface FonteLinha {
  quadros(): number;
  quadroAgora(): number;            // pode ser fracionário (tocando)
  chaves(): Map<number, boolean>;   // dos ossos em foco; true = só bordas (sem ajuste)
  chavesOutros(): Map<number, boolean>;
  interp?(q: number): number | undefined;
  irPara(f: number): void;
  comecarArrasteChave(): void;
  moverChave(de: number, para: number): boolean;
  fimArrasteChave(moveu: boolean): void;
  loopMudou(a: number | null, b: number | null, tocar: boolean): void;
}

const PADX = 8, REGUA = 15;

export class LinhaTempo {
  loopA: number | null = null;
  loopB: number | null = null;
  private lc: CanvasRenderingContext2D;
  private arr: { tipo: 'loop' | 'tempo' | 'chave'; de?: number; moveu?: boolean } | null = null;

  constructor(private el: HTMLCanvasElement, private f: FonteLinha) {
    this.lc = el.getContext('2d')!;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', () => this.up());
    el.addEventListener('dblclick', (e) => {
      if (e.clientY - el.getBoundingClientRect().top < REGUA) this.tirarLoop();
    });
  }

  tirarLoop() { this.loopA = this.loopB = null; this.f.loopMudou(null, null, false); }
  temLoop() { return this.loopA !== null && this.loopB !== null && this.loopA !== this.loopB; }
  definirLoop(a: number, b: number) { this.loopA = Math.min(a, b); this.loopB = Math.max(a, b); this.f.loopMudou(this.loopA, this.loopB, false); }

  private xDe(q: number) { return PADX + (this.el.clientWidth - 2 * PADX) * q / Math.max(1, this.f.quadros()); }
  private qDe(x: number) {
    const n = this.f.quadros();
    return Math.max(0, Math.min(n, Math.round((x - PADX) / Math.max(1, this.el.clientWidth - 2 * PADX) * n)));
  }
  private chaveSob(x: number) {
    let melhor: number | null = null;
    for (const q of this.f.chaves().keys()) {
      const d = Math.abs(this.xDe(q) - x);
      if (d <= 7 && (melhor === null || d < Math.abs(this.xDe(melhor) - x))) melhor = q;
    }
    return melhor;
  }
  private down(e: PointerEvent) {
    if (!this.f.quadros()) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, q = this.qDe(x);
    this.el.setPointerCapture(e.pointerId);
    if (y < REGUA) { this.arr = { tipo: 'loop' }; this.loopA = this.loopB = q; this.f.irPara(q); return; }
    const k = this.chaveSob(x);
    if (k !== null) { this.f.comecarArrasteChave(); this.arr = { tipo: 'chave', de: k, moveu: false }; this.f.irPara(k); return; }
    this.arr = { tipo: 'tempo' };
    this.f.irPara(q);
  }
  private move(e: PointerEvent) {
    if (!this.arr) return;
    const q = this.qDe(e.clientX - this.el.getBoundingClientRect().left);
    if (this.arr.tipo === 'loop') { this.loopB = q; this.f.irPara(q); }
    else if (this.arr.tipo === 'tempo') this.f.irPara(q);
    else if (this.f.moverChave(this.arr.de!, q)) { if (q !== this.arr.de) this.arr.moveu = true; this.arr.de = q; this.f.irPara(q); }
  }
  private up() {
    if (!this.arr) return;
    if (this.arr.tipo === 'loop') {
      if (Math.abs(this.loopB! - this.loopA!) < 2) this.tirarLoop();
      else {
        const a = Math.min(this.loopA!, this.loopB!), b = Math.max(this.loopA!, this.loopB!);
        this.loopA = a; this.loopB = b;
        this.f.irPara(a);
        this.f.loopMudou(a, b, true);
      }
    } else if (this.arr.tipo === 'chave') this.f.fimArrasteChave(!!this.arr.moveu);
    this.arr = null;
  }

  desenhar() {
    const el = this.el, lc = this.lc;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.clearRect(0, 0, W, H);
    const n = this.f.quadros();
    if (!n) return;
    const acc = cor('acc'), mut = cor('mut');
    lc.fillStyle = cor('panel'); lc.fillRect(0, 0, W, REGUA);
    lc.fillStyle = cor('panel2'); lc.fillRect(0, REGUA, W, H - REGUA);
    if (this.temLoop()) {
      const a = Math.min(this.loopA!, this.loopB!), b = Math.max(this.loopA!, this.loopB!);
      lc.globalAlpha = 0.18; lc.fillStyle = acc; lc.fillRect(this.xDe(a), 0, this.xDe(b) - this.xDe(a), H); lc.globalAlpha = 1;
      lc.fillStyle = acc; lc.fillRect(this.xDe(a) - 1, 0, 2, REGUA); lc.fillRect(this.xDe(b) - 1, 0, 2, REGUA);
    }
    const passoPx = (W - 2 * PADX) / n;
    const cada = passoPx > 9 ? 1 : passoPx > 4 ? 2 : passoPx > 1.5 ? 5 : 10;
    const rotCada = passoPx > 18 ? 5 : passoPx > 6 ? 10 : passoPx > 2 ? 20 : 50;
    lc.font = '10px system-ui'; lc.textAlign = 'center';
    for (let q = 0; q <= n; q += cada) {
      const x = this.xDe(q);
      const big = q % rotCada === 0;
      lc.globalAlpha = 0.45; lc.fillStyle = mut;
      lc.fillRect(x, big ? 0 : REGUA - 5, 1, big ? REGUA : 5);
      lc.globalAlpha = 1;
      if (big && q) { lc.fillStyle = mut; lc.fillText(String(q), x + (q === n ? -8 : 9), 10); }
    }
    const meio = REGUA + (H - REGUA) / 2;
    const marca = (x: number, y: number, r: number, cheio: boolean, c: string, quadrado: boolean) => {
      lc.beginPath();
      if (quadrado) lc.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
      else { lc.moveTo(x, y - r); lc.lineTo(x + r, y); lc.lineTo(x, y + r); lc.lineTo(x - r, y); lc.closePath(); }
      if (cheio) { lc.fillStyle = c; lc.fill(); } else { lc.strokeStyle = c; lc.lineWidth = 1.5; lc.stroke(); }
    };
    for (const [q, z] of this.f.chavesOutros()) if (!z) marca(this.xDe(q), H - 6, 3.5, true, mut, false);
    for (const [q, z] of this.f.chaves()) marca(this.xDe(q), meio, 6, !z, acc, this.f.interp?.(q) === 2);
    const xp = this.xDe(this.f.quadroAgora());
    lc.fillStyle = cor('vermelho'); lc.fillRect(xp - 1, 0, 2, H);
    lc.beginPath(); lc.moveTo(xp - 5, 0); lc.lineTo(xp + 5, 0); lc.lineTo(xp, 6); lc.fill();
  }
}
