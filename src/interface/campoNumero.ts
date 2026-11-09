// Campo numérico de editor 3D: arrastar no rótulo pra mudar (Shift = fino, Ctrl = grosso) ou digitar.
export interface OpcoesCampo {
  rotulo: string;
  titulo?: string;
  passo: number;          // quanto muda por pixel arrastado
  casas: number;
  sufixo?: string;
  cor?: string;
  comecar?: () => boolean | void;   // false = não deixa editar
  mudar: (v: number) => void;
  terminar?: () => void;
}

export class CampoNumero {
  readonly el: HTMLElement;
  private inp: HTMLInputElement;
  private v = 0;
  private editando = false;

  constructor(private o: OpcoesCampo) {
    this.el = document.createElement('label');
    this.el.className = 'num';
    if (o.titulo) this.el.title = o.titulo;
    const r = document.createElement('span');
    r.className = 'rot';
    r.textContent = o.rotulo;
    if (o.cor) r.style.color = o.cor;
    this.inp = document.createElement('input');
    this.inp.type = 'text';
    this.inp.inputMode = 'decimal';
    this.el.append(r, this.inp);
    // arrastar no rótulo
    r.addEventListener('pointerdown', (e) => {
      if (this.inp.disabled || o.comecar?.() === false) return;
      e.preventDefault();
      r.setPointerCapture(e.pointerId);
      const x0 = e.clientX, v0 = this.v;
      this.editando = true;
      document.body.classList.add('arrastando-num');
      const mover = (ev: PointerEvent) => {
        const k = ev.shiftKey ? 0.1 : ev.ctrlKey ? 10 : 1;
        this.v = v0 + (ev.clientX - x0) * o.passo * k;
        this.mostrar();
        o.mudar(this.v);
      };
      const soltar = () => {
        r.removeEventListener('pointermove', mover);
        r.removeEventListener('pointerup', soltar);
        r.removeEventListener('pointercancel', soltar);
        this.editando = false;
        document.body.classList.remove('arrastando-num');
        o.terminar?.();
      };
      r.addEventListener('pointermove', mover);
      r.addEventListener('pointerup', soltar);
      r.addEventListener('pointercancel', soltar);
    });
    // digitar
    this.inp.addEventListener('focus', () => { this.inp.select(); });
    const aplicar = () => {
      const n = parseFloat(this.inp.value.replace(',', '.'));
      if (!Number.isFinite(n) || Math.abs(n - this.v) < 1e-9) { this.mostrar(); return; }
      if (o.comecar?.() === false) { this.mostrar(); return; }
      this.v = n;
      o.mudar(n);
      o.terminar?.();
      this.mostrar();
    };
    this.inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { aplicar(); this.inp.blur(); }
      else if (e.key === 'Escape') { this.mostrar(); this.inp.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (o.comecar?.() === false) return;
        this.v += (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 1) * Math.max(o.passo * 10, 10 ** -o.casas);
        o.mudar(this.v); o.terminar?.(); this.mostrar();
      }
    });
    this.inp.addEventListener('blur', aplicar);
  }
  private mostrar() { this.inp.value = this.v.toFixed(this.o.casas).replace('.', ',') + (this.o.sufixo || ''); }
  /** Valor vindo de fora (não mexe enquanto a pessoa digita ou arrasta). */
  definir(v: number) {
    if (this.editando || document.activeElement === this.inp) return;
    if (Math.abs(v - this.v) < 10 ** -(this.o.casas + 1) && this.inp.value) return;
    this.v = v;
    this.mostrar();
  }
  habilitar(sim: boolean) { this.inp.disabled = !sim; this.el.classList.toggle('off', !sim); }
}
