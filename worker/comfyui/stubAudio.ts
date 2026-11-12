/** Fake MP3 for the `stub` mode: silent MPEG-1 Layer III frames
 * (44.1 kHz, mono, 128 kbit/s), valid and lightweight, without dependencies. The real sound
 * comes from ComfyUI (`http` mode). One frame = 1152 samples ≈ 26.1 ms and
 * 417 bytes; header 0xFFFB 0x90 0xC4, the rest zeroed = silence. */
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
