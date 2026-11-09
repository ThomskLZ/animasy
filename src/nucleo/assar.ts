// "Assar" os ajustes: transformar animação original + camadas num clipe novo (o que vai pro arquivo).
// A conta é a mesma do editor: rotação = original × camadas; posição = original + camadas.
// O clipe novo tem uma chave por quadro (LINEAR) nos ossos ajustados, mais as chaves originais no meio,
// então nos quadros o arquivo bate com o editor (só sobra o arredondamento do float32).
import { AnimationClip, KeyframeTrack, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { Camada, deltaCamadas, ossosDaCamada } from './camadas';
import { anguloQuat, MapaRepouso, Repouso, trilha, valorOriginal } from './clipe';

export type { Repouso, MapaRepouso } from './clipe';
export { valorOriginal, anguloQuat } from './clipe';

/** Valor local com as camadas por cima (o que o editor mostra com a animação sozinha, peso 1). */
export function valorAjustado(clip: AnimationClip, camadas: Camada[] | undefined, osso: string, t: number, fps: number, rep: Repouso | undefined, repTodos?: MapaRepouso) {
  const { q, p } = valorOriginal(clip, osso, t, rep);
  if (camadas?.length) {
    const d = deltaCamadas(camadas, { clip, fps, rep: repTodos ?? new Map(rep ? [[osso, rep]] : []) }, osso, t * fps);
    q.multiply(d.q);
    p.add(d.p);
  }
  return { q, p };
}

/** Clipe novo com as camadas aplicadas. Sem ajuste, devolve uma cópia. */
export function assarClip(clip: AnimationClip, camadas: Camada[] | undefined, fps: number, repouso: MapaRepouso, nome = clip.name): AnimationClip {
  const ajustadas = new Set<string>();
  const novas: KeyframeTrack[] = [];
  const n = Math.round(clip.duration * fps);
  const porOsso = new Map<string, { rot: boolean; pos: boolean }>();
  for (const c of camadas || []) {
    if (!c.ligada || c.peso <= 1e-4) continue;
    for (const o of ossosDaCamada(c, clip)) {
      const r = porOsso.get(o) || { rot: false, pos: false };
      if (c.tipo === 'ajuste') { r.rot ||= !!c.ajustes[o].rot; r.pos ||= !!c.ajustes[o].pos; }
      else { r.rot = true; r.pos ||= !!trilha(clip, o, 'position'); }
      porOsso.set(o, r);
    }
  }
  for (const [osso, tem] of porOsso) {
    for (const prop of ['quaternion', 'position'] as const) {
      if (prop === 'quaternion' ? !tem.rot : !tem.pos) continue;
      const orig = trilha(clip, osso, prop);
      const tempos = new Set<number>();
      for (let f = 0; f <= n; f++) tempos.add(Math.min(clip.duration, f / fps));
      if (orig) for (const t of orig.times) tempos.add(t);
      const ts = [...tempos].sort((a, b) => a - b);
      const lista: number[] = [];
      for (const t of ts) if (!lista.length || t - lista[lista.length - 1] > 1e-5) lista.push(t);
      const vals: number[] = [];
      let qAnt: Quaternion | null = null;
      for (const t of lista) {
        const v = valorAjustado(clip, camadas, osso, t, fps, repouso.get(osso), repouso);
        if (prop === 'quaternion') {
          if (qAnt && qAnt.dot(v.q) < 0) v.q.set(-v.q.x, -v.q.y, -v.q.z, -v.q.w);   // caminho curto no slerp
          qAnt = v.q;
          vals.push(v.q.x, v.q.y, v.q.z, v.q.w);
        } else vals.push(v.p.x, v.p.y, v.p.z);
      }
      const nomeT = `${osso}.${prop}`;
      novas.push(prop === 'quaternion' ? new QuaternionKeyframeTrack(nomeT, lista, vals) : new VectorKeyframeTrack(nomeT, lista, vals));
      ajustadas.add(nomeT);
    }
  }
  const tracks = clip.tracks.filter((t) => !ajustadas.has(t.name)).map((t) => t.clone()).concat(novas);
  return new AnimationClip(nome, clip.duration, tracks);
}

/** Clipe parado numa pose: duas chaves (começo e fim) por osso. */
export function clipeParado(nome: string, duracao: number, pose: Map<string, { q: Quaternion; p: Vector3 }>, comPosicao: Set<string>): AnimationClip {
  const tracks: KeyframeTrack[] = [];
  for (const [osso, v] of pose) {
    tracks.push(new QuaternionKeyframeTrack(`${osso}.quaternion`, [0, duracao], [v.q.x, v.q.y, v.q.z, v.q.w, v.q.x, v.q.y, v.q.z, v.q.w]));
    if (comPosicao.has(osso)) tracks.push(new VectorKeyframeTrack(`${osso}.position`, [0, duracao], [v.p.x, v.p.y, v.p.z, v.p.x, v.p.y, v.p.z]));
  }
  return new AnimationClip(nome, duracao, tracks);
}

export interface Diferenca { graus: number; metros: number; onde: string }

/**
 * Confere um arquivo salvo: pra cada animação, compara quadro a quadro o valor de cada osso no arquivo reaberto
 * com o que o editor mostra. Devolve a maior diferença (em graus e metros) e onde aconteceu.
 */
export function compararClipes(esperado: { clip: AnimationClip; camadas?: Camada[]; fps: number }[], reaberto: AnimationClip[],
  repEditor: MapaRepouso, repArquivo: MapaRepouso, nomeArquivo: (osso: string) => string): Diferenca & { faltando: string[] } {
  const r = { graus: 0, metros: 0, onde: '', faltando: [] as string[] };
  for (const { clip, camadas, fps } of esperado) {
    const outro = reaberto.find((c) => c.name === clip.name);
    if (!outro) { r.faltando.push(clip.name); continue; }
    const ossos = new Set<string>();
    for (const t of clip.tracks) ossos.add(t.name.slice(0, t.name.lastIndexOf('.')));
    for (const c of camadas || []) for (const o of ossosDaCamada(c, clip)) ossos.add(o);
    const n = Math.round(clip.duration * fps);
    for (let f = 0; f <= n; f++) {
      const t = Math.min(clip.duration, f / fps);
      for (const o of ossos) {
        const a = valorAjustado(clip, camadas, o, t, fps, repEditor.get(o), repEditor);
        const b = valorOriginal(outro, nomeArquivo(o), t, repArquivo.get(nomeArquivo(o)));
        const g = anguloQuat(a.q, b.q);
        const m = a.p.distanceTo(b.p);
        if (g > r.graus) { r.graus = g; r.onde = `${clip.name} · ${o} · quadro ${f}`; }
        if (m > r.metros) r.metros = m;
      }
    }
  }
  return r;
}
