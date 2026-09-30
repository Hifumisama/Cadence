/** Rognage audio côté navigateur (casting vocal, étape 1 : référence fournie
 * qu'on coupe à la taille exacte de la réplique). Décode le fichier, garde
 * l'intervalle [debut, fin] et le réencode en WAV PCM 16 bits — sans perte
 * par rapport au signal décodé, et lisible partout (jamais de MP3, voix-comfyui).
 * Client uniquement (AudioContext). */

export async function decoderAudio(fichier: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await fichier.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

export function encoderWav(buffer: AudioBuffer, debut: number, fin: number): Blob {
  const rate = buffer.sampleRate;
  const i0 = Math.max(0, Math.floor(debut * rate));
  const i1 = Math.min(buffer.length, Math.max(i0 + 1, Math.floor(fin * rate)));
  const n = i1 - i0;
  const canaux = buffer.numberOfChannels;
  const octets = n * canaux * 2;
  const out = new DataView(new ArrayBuffer(44 + octets));
  const ecrire = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i));
  };
  ecrire(0, "RIFF");
  out.setUint32(4, 36 + octets, true);
  ecrire(8, "WAVE");
  ecrire(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, canaux, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * canaux * 2, true);
  out.setUint16(32, canaux * 2, true);
  out.setUint16(34, 16, true);
  ecrire(36, "data");
  out.setUint32(40, octets, true);
  const donnees = Array.from({ length: canaux }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = i0; i < i1; i++) {
    for (let c = 0; c < canaux; c++) {
      const v = Math.max(-1, Math.min(1, donnees[c]![i]!));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

export function formaterSecondes(s: number): string {
  return `${s.toFixed(2).replace(".", ",")} s`;
}
