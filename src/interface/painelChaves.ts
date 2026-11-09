// Painel de chaves embaixo da cena: dope sheet (uma linha por osso) e editor de curvas (avançado).
import { cor } from './tema';

export interface LinhaDope { osso: string; rotulo: string; chaves: number[]; sel: boolean }
export interface Curvas { eixos: { nome: string; cor: string; valores: number[] }[]; chaves: number[]; unidade: string }

export interface FonteChaves {
  quadros(): number;
  quadroAgora(): number;
  linhas(): LinhaDope[];
  irPara(f: number): void;
  escolherOsso(n: string): void;
  comecarArraste(): void;
  moverChave(ossos: string[] | null, de: number, para: number): boolean;   // null = todos
  fimArraste(moveu: boolean): void;
  curvas(): Curvas | null;
  comecarCurva(f: number): boolean;
  editarCurva(f: number, eixo: number, valor: number): void;
  fimCurva(): void;
}

const ESQ = 132, REGUA = 16, ALT = 18, PAD = 8;

export class PainelChaves {
  modo: 'dope' | 'curvas' = 'dope';
  private lc: CanvasRenderingContext2D;
  private rolagem = 0;
  private arr: { tipo: 'tempo' | 'chave' | 'curva'; ossos?: string[] | null; de?: number; moveu?: boolean; eixo?: number } | null = null;
  private escala = { min: -90, max: 90 };

  constructor(private el: HTMLCanvasElement, private f: FonteChaves) {
    this.lc = el.getContext('2d')!;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', () => this.up());
    el.addEventListener('wheel', (e) => {
      if (this.modo !== 'dope') return;
      e.preventDefault();
      const max = Math.max(0, (this.f.linhas().length + 1) * ALT - (el.clientHeight - REGUA));
      this.rolagem = Math.max(0, Math.min(max, this.rolagem + e.deltaY * 0.5));
    }, { passive: false });
  }

  private larg() { return this.el.clientWidth - ESQ - PAD; }
  private xDe(q: number) { return ESQ + this.larg() * q / Math.max(1, this.f.quadros()); }
  private qDe(x: number) { const n = this.f.quadros(); return Math.max(0, Math.min(n, Math.round((x - ESQ) / Math.max(1, this.larg()) * n))); }
  private yDe(v: number) { const H = this.el.clientHeight; const { min, max } = this.escala; return REGUA + 6 + (H - REGUA - 12) * (1 - (v - min) / Math.max(1e-6, max - min)); }
  private vDe(y: number) { const H = this.el.clientHeight; const { min, max } = this.escala; return min + (1 - (y - REGUA - 6) / (H - REGUA - 12)) * (max - min); }

  private down(e: PointerEvent) {
    if (!this.f.quadros()) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.el.setPointerCapture(e.pointerId);
    if (this.modo === 'dope') {
      const linhas = this.f.linhas();
      const i = Math.floor((y - REGUA + this.rolagem) / ALT);   // 0 = "Todos"
      if (y > REGUA && x < ESQ) { if (i >= 1 && linhas[i - 1]) this.f.escolherOsso(linhas[i - 1].osso); return; }
      if (y > REGUA && i >= 0 && i <= linhas.length) {
        const chaves = i === 0 ? [...new Set(linhas.flatMap((l) => l.chaves))] : linhas[i - 1].chaves;
        const k = chaves.find((q) => Math.abs(this.xDe(q) - x) <= 6);
        if (k !== undefined) {
          if (i > 0) this.f.escolherOsso(linhas[i - 1].osso);
          this.f.comecarArraste();
          this.arr = { tipo: 'chave', ossos: i === 0 ? null : [linhas[i - 1].osso], de: k, moveu: false };
          this.f.irPara(k);
          return;
        }
      }
    } else {
      const c = this.f.curvas();
      if (c) {
        let melhor: { k: number; e: number; d: number } | null = null;
        c.eixos.forEach((ex, ei) => {
          for (const k of c.chaves) {
            const d = Math.hypot(this.xDe(k) - x, this.yDe(ex.valores[k]) - y);
            if (d < 8 && (!melhor || d < melhor.d)) melhor = { k, e: ei, d };
          }
        });
        if (melhor && this.f.comecarCurva((melhor as { k: number }).k)) {
          const m = melhor as { k: number; e: number };
          this.arr = { tipo: 'curva', de: m.k, eixo: m.e, moveu: false };
          this.f.irPara(m.k);
          return;
        }
      }
    }
    this.arr = { tipo: 'tempo' };
    this.f.irPara(this.qDe(x));
  }
  private move(e: PointerEvent) {
    if (!this.arr) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, q = this.qDe(x);
    if (this.arr.tipo === 'tempo') this.f.irPara(q);
    else if (this.arr.tipo === 'chave') {
      if (q !== this.arr.de && this.f.moverChave(this.arr.ossos!, this.arr.de!, q)) { this.arr.moveu = true; this.arr.de = q; this.f.irPara(q); }
    } else {
      this.arr.moveu = true;
      this.f.editarCurva(this.arr.de!, this.arr.eixo!, this.vDe(y));
    }
  }
  private up() {
    if (!this.arr) return;
    if (this.arr.tipo === 'chave') this.f.fimArraste(!!this.arr.moveu);
    else if (this.arr.tipo === 'curva') this.f.fimCurva();
    this.arr = null;
  }

  desenhar() {
    const el = this.el, lc = this.lc;
    if (!el.clientWidth || !el.clientHeight) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = el.clientWidth, H = el.clientHeight;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.clearRect(0, 0, W, H);
    const n = this.f.quadros();
    const mut = cor('mut'), acc = cor('acc'), txt = cor('txt');
    lc.fillStyle = cor('panel2'); lc.fillRect(0, 0, W, H);
    lc.fillStyle = cor('panel'); lc.fillRect(0, 0, W, REGUA); lc.fillRect(0, 0, ESQ, H);
    lc.font = '10px system-ui';
    if (!n) return;
    // régua
    const passoPx = this.larg() / n;
    const rotCada = passoPx > 18 ? 5 : passoPx > 6 ? 10 : passoPx > 2 ? 20 : 50;
    lc.textAlign = 'center';
    for (let q = 0; q <= n; q += rotCada) {
      const x = this.xDe(q);
      lc.globalAlpha = 0.25; lc.fillStyle = mut; lc.fillRect(x, REGUA, 1, H - REGUA); lc.globalAlpha = 1;
      lc.fillStyle = mut; lc.fillText(String(q), x, 11);
    }
    lc.save();
    lc.beginPath(); lc.rect(0, REGUA, W, H - REGUA); lc.clip();
    if (this.modo === 'dope') this.dope(lc, W, acc, mut, txt);
    else this.curvas(lc, W, H, mut, txt);
    lc.restore();
    const xp = this.xDe(this.f.quadroAgora());
    lc.fillStyle = cor('vermelho'); lc.fillRect(xp - 1, 0, 2, H);
  }

  private dope(lc: CanvasRenderingContext2D, W: number, acc: string, mut: string, txt: string) {
    const linhas = this.f.linhas();
    const todas = [...new Set(linhas.flatMap((l) => l.chaves))];
    const lista: { rotulo: string; chaves: number[]; sel: boolean; resumo?: boolean }[] = [{ rotulo: 'Todos', chaves: todas, sel: false, resumo: true }, ...linhas];
    lc.textAlign = 'left';
    lista.forEach((l, i) => {
      const y = REGUA + i * ALT - this.rolagem;
      if (y + ALT < REGUA || y > this.el.clientHeight) return;
      if (l.sel) { lc.globalAlpha = 0.16; lc.fillStyle = acc; lc.fillRect(0, y, W, ALT); lc.globalAlpha = 1; }
      lc.globalAlpha = 0.12; lc.fillStyle = mut; lc.fillRect(0, y + ALT - 1, W, 1); lc.globalAlpha = 1;
      lc.fillStyle = l.sel ? acc : l.resumo ? mut : txt;
      lc.font = l.resumo ? 'bold 11px system-ui' : '11px system-ui';
      lc.fillText(l.rotulo.length > 20 ? l.rotulo.slice(0, 19) + '…' : l.rotulo, 8, y + 13);
      for (const q of l.chaves) {
        const x = this.xDe(q), yc = y + ALT / 2, r = l.resumo ? 5 : 4.5;
        lc.beginPath(); lc.moveTo(x, yc - r); lc.lineTo(x + r, yc); lc.lineTo(x, yc + r); lc.lineTo(x - r, yc); lc.closePath();
        lc.fillStyle = l.resumo ? mut : acc; lc.fill();
      }
    });
    if (!linhas.length) { lc.fillStyle = mut; lc.font = '12px system-ui'; lc.fillText('Sem chaves nesta camada ainda.', ESQ + 10, REGUA + ALT + 14); }
  }

  private curvas(lc: CanvasRenderingContext2D, W: number, H: number, mut: string, txt: string) {
    const c = this.f.curvas();
    lc.textAlign = 'left';
    if (!c) { lc.fillStyle = mut; lc.font = '12px system-ui'; lc.fillText('Escolha um osso pra ver as curvas.', ESQ + 10, REGUA + 24); return; }
    if (!this.arr || this.arr.tipo !== 'curva') {   // escala fixa enquanto arrasta
      let min = Infinity, max = -Infinity;
      for (const e of c.eixos) for (const v of e.valores) { min = Math.min(min, v); max = Math.max(max, v); }
      const m = Math.max(5, (max - min) * 0.12);
      this.escala = { min: min - m, max: max + m };
    }
    // grade
    const passo = niceStep((this.escala.max - this.escala.min) / 4);
    lc.font = '10px system-ui';
    for (let v = Math.ceil(this.escala.min / passo) * passo; v <= this.escala.max; v += passo) {
      const y = this.yDe(v);
      lc.globalAlpha = Math.abs(v) < 1e-9 ? 0.4 : 0.15; lc.fillStyle = mut; lc.fillRect(ESQ, y, W - ESQ, 1); lc.globalAlpha = 1;
      lc.fillStyle = mut; lc.fillText(`${Math.round(v)}${c.unidade}`, ESQ - 40, y + 3);
    }
    c.eixos.forEach((e, i) => {
      lc.strokeStyle = e.cor; lc.lineWidth = 1.6;
      lc.beginPath();
      e.valores.forEach((v, q) => { const x = this.xDe(q), y = this.yDe(v); if (q) lc.lineTo(x, y); else lc.moveTo(x, y); });
      lc.stroke();
      for (const k of c.chaves) {
        lc.beginPath(); lc.arc(this.xDe(k), this.yDe(e.valores[k]), 4, 0, Math.PI * 2);
        lc.fillStyle = e.cor; lc.fill(); lc.strokeStyle = txt; lc.lineWidth = 1; lc.stroke();
      }
      lc.fillStyle = e.cor; lc.font = 'bold 11px system-ui';
      lc.fillText(e.nome, 10, REGUA + 18 + i * 16);
    });
  }
}

function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1e-6, x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
