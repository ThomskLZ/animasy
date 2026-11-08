// Ícones em linha (SVG), pra não depender de fonte nem de emoji.
const svg = (d: string, t = 16) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICONES: Record<string, string> = {
  abrir: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  salvar: svg('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>'),
  seta: svg('<path d="M6 9l6 6 6-6"/>', 12),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  lixo: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 14),
  renomear: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>', 14),
  duplicar: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>', 14),
  restaurar: svg('<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>', 14),
  mapa: svg('<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M7 11h10M12 15l-4 6M12 15l4 6"/>'),
  soltar: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', 44),
};

/** Põe o ícone em todo elemento com data-ico. */
export function aplicarIcones(raiz: ParentNode = document) {
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-ico]')) el.innerHTML = ICONES[el.dataset.ico!] || '';
}
