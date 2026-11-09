// Esticar/encurtar o tempo: a animação inteira (duração nova) ou só um trecho.
// g(t) leva o tempo antigo pro novo (sempre crescente). As chaves mantêm os valores; só mudam de lugar.
// Nas "quebras" (pontas do trecho) entra uma chave nova com o valor de lá, senão a reta entre duas chaves que
// atravessam a ponta entortaria.
import { AnimationClip } from 'three';

export type Remapa = (t: number) => number;

export function retimeClip(clip: AnimationClip, g: Remapa, novaDur: number, quebras: number[] = []): AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const n = t.clone();
    const tam = t.getValueSize();
    let times: number[] = Array.from(t.times), values: number[] = Array.from(t.values as ArrayLike<number>);
    const interp = t.createInterpolant();
    for (const q of quebras) {
      if (q <= times[0] + 1e-6 || q >= times[times.length - 1] - 1e-6 || times.some((x) => Math.abs(x - q) < 1e-6)) continue;
      const v = Array.from(interp.evaluate(q) as ArrayLike<number>);
      const i = times.findIndex((x) => x > q);
      times = [...times.slice(0, i), q, ...times.slice(i)];
      values = [...values.slice(0, i * tam), ...v, ...values.slice(i * tam)];
    }
    const ts = new Float32Array(times.length);
    for (let i = 0; i < ts.length; i++) ts[i] = Math.min(novaDur, Math.max(0, g(times[i])));
    for (let i = 1; i < ts.length; i++) if (ts[i] <= ts[i - 1]) ts[i] = ts[i - 1] + 1e-5;   // nunca dois iguais
    n.times = ts;
    n.values = new Float32Array(values);
    return n;
  });
  return new AnimationClip(clip.name, novaDur, tracks);
}

/** Remapa do trecho [a, b] (segundos) esticado pelo fator `k` (2 = fica com o dobro do tempo). */
export function remapaTrecho(a: number, b: number, k: number): Remapa {
  const nb = a + (b - a) * k;
  return (t) => (t <= a ? t : t >= b ? nb + (t - b) : a + (t - a) * k);
}
