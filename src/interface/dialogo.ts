// Diálogos próprios (no lugar de confirm/prompt do navegador): mais bonitos e não travam a página.
// Respondem direto no clique (não dependem do evento "close", que alguns navegadores atrasam).
const dlg = () => document.getElementById('dlg') as HTMLDialogElement;
const form = () => document.getElementById('dlgForm') as HTMLFormElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Abre o diálogo com o HTML dado; resolve com o value do botão apertado ('' = cancelou/Esc; Enter = 'ok'). */
export function abrirDialogo(html: string, aoAbrir?: (f: HTMLFormElement) => void): Promise<{ botao: string; form: HTMLFormElement }> {
  const d = dlg(), f = form();
  f.innerHTML = html;
  for (const b of f.querySelectorAll('button')) b.type = 'button';
  aoAbrir?.(f);
  return new Promise((ok) => {
    let feito = false;
    const terminar = (v: string) => {
      if (feito) return;
      feito = true;
      f.onclick = f.onsubmit = d.onkeydown = d.oncancel = null;
      d.close();
      ok({ botao: v, form: f });
    };
    f.onsubmit = (e) => { e.preventDefault(); };
    f.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && f.contains(b)) terminar(b.value);
    };
    d.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); terminar(''); }
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && f.querySelector('button[value=ok]')) { e.preventDefault(); terminar('ok'); }
    };
    d.oncancel = (e) => { e.preventDefault(); terminar(''); };
    d.showModal();
    (f.querySelector('[autofocus]') as HTMLElement | null)?.focus();
  });
}

export async function confirmar(titulo: string, texto: string, ok = 'OK', perigo = false): Promise<boolean> {
  const { botao } = await abrirDialogo(`<h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}
    <div class="rodape"><button class="btn" value="">Cancelar</button>
    <button class="btn ${perigo ? 'perigo-forte' : 'acc'}" value="ok" autofocus>${esc(ok)}</button></div>`);
  return botao === 'ok';
}

export async function avisar(titulo: string, texto: string) {
  await abrirDialogo(`<h3>${esc(titulo)}</h3><p>${esc(texto)}</p><div class="rodape"><button class="btn acc" value="ok" autofocus>OK</button></div>`);
}

export { esc };
