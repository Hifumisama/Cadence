import { deflateSync } from "node:zlib";

/** PNG factice pour le mode `stub` : un dégradé sombre à liseré or, valide et
 * léger, sans dépendance. Le vrai rendu vient de ComfyUI (mode `http`). */

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, donnees: Uint8Array): Buffer {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, "ascii");
  const corps = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(donnees)]);
  const fin = Buffer.alloc(4);
  fin.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([tete, Buffer.from(donnees), fin]);
}

export function pngFactice(largeur = 512, hauteur = 288): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const brut = Buffer.alloc((largeur * 3 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const ligne = y * (largeur * 3 + 1);
    brut[ligne] = 0; // filtre aucun
    for (let x = 0; x < largeur; x++) {
      const liseré = x < 3 || y < 3 || x >= largeur - 3 || y >= hauteur - 3;
      const g = 24 + Math.floor((y / hauteur) * 24);
      const i = ligne + 1 + x * 3;
      brut[i] = liseré ? 201 : g;
      brut[i + 1] = liseré ? 162 : g;
      brut[i + 2] = liseré ? 39 : g + 6;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", ihdr),
    bloc("IDAT", deflateSync(brut)),
    bloc("IEND", new Uint8Array(0)),
  ]);
}
