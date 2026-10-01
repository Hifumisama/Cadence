/** MP3 factice pour le mode `stub` : des trames MPEG-1 Layer III silencieuses
 * (44,1 kHz, mono, 128 kbit/s), valides et légères, sans dépendance. Le vrai son
 * vient de ComfyUI (mode `http`). Une trame = 1152 échantillons ≈ 26,1 ms et
 * 417 octets ; en-tête 0xFFFB 0x90 0xC4, le reste à zéro = silence. */
const OCTETS_PAR_TRAME = 417;
const SECONDES_PAR_TRAME = 1152 / 44100;

export function mp3Factice(secondes = 2): Buffer {
  const trames = Math.max(1, Math.ceil(secondes / SECONDES_PAR_TRAME));
  const trame = Buffer.alloc(OCTETS_PAR_TRAME);
  trame[0] = 0xff;
  trame[1] = 0xfb;
  trame[2] = 0x90;
  trame[3] = 0xc4;
  return Buffer.concat(Array.from({ length: trames }, () => trame));
}
