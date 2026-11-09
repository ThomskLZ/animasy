// Esticar/encurtar o tempo: a animação inteira (duração nova) ou só um trecho.
// g(t) leva o tempo antigo pro novo (sempre crescente). As chaves mantêm os valores; só mudam de lugar.
import { AnimationClip } from 'three';

export type Remapa = (t: number) => number;

export function retimeClip(clip: AnimationClip, g: Remapa, novaDur: number): AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const n = t.clone();
    const ts = new Float32Array(t.times.length);
    for (let i = 0; i < ts.length; i++) ts[i] = Math.min(novaDur, Math.max(0, g(t.times[i])));
    for (let i = 1; i < ts.length; i++) if (ts[i] <= ts[i - 1]) ts[i] = ts[i - 1] + 1e-5;   // nunca dois iguais
    n.times = ts;
    return n;
  });
  return new AnimationClip(clip.name, novaDur, tracks);
}

/** Remapa do trecho [a, b] (segundos) esticado pelo fator `k` (2 = fica com o dobro do tempo). */
export function remapaTrecho(a: number, b: number, k: number): Remapa {
  const nb = a + (b - a) * k;
  return (t) => (t <= a ? t : t >= b ? nb + (t - b) : a + (t - a) * k);
}
