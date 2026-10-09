import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ajouterBalise,
  corrigerBalise,
  decoderLocuteur,
  exportRepliquesCsv,
  langueBalise,
  mesurerDureeAudio,
  nomLocuteur,
  priseObsolete,
} from "./repliques";
import { extraireBalisesD } from "./plan-checks";

function wav(secondes: number, hz = 16000, extraChunk = false): Uint8Array {
  const octetsParSeconde = hz * 2;
  const data = Math.round(secondes * octetsParSeconde);
  const b = Buffer.alloc(44 + data + (extraChunk ? 12 : 0));
  b.write("RIFF", 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8);
  let o = 12;
  if (extraChunk) {
    b.write("LIST", o);
    b.writeUInt32LE(4, o + 4);
    b.write("INFO", o + 8);
    o += 12;
  }
  b.write("fmt ", o);
  b.writeUInt32LE(16, o + 4);
  b.writeUInt16LE(1, o + 8);
  b.writeUInt16LE(1, o + 10);
  b.writeUInt32LE(hz, o + 12);
  b.writeUInt32LE(octetsParSeconde, o + 16);
  b.writeUInt16LE(2, o + 20);
  b.writeUInt16LE(16, o + 22);
  b.write("data", o + 24);
  b.writeUInt32LE(data, o + 28);
  return b;
}

function flac(secondes: number, hz: number): Uint8Array {
  const b = Buffer.alloc(42);
  b.write("fLaC", 0);
  b[4] = 0x80; // dernier bloc, type STREAMINFO
  b.writeUIntBE(34, 5, 3);
  const total = BigInt(Math.round(secondes * hz));
  // 20 bits fréquence | 3 bits canaux-1 | 5 bits profondeur-1 | 36 bits échantillons
  const bits = (BigInt(hz) << 44n) | (0n << 41n) | (15n << 36n) | total;
  b.writeBigUInt64BE(bits, 8 + 10);
  return b;
}

test("durée d'un WAV, avec ou sans chunk intermédiaire", () => {
  assert.equal(mesurerDureeAudio(wav(2), "prise.wav"), 2);
  assert.equal(mesurerDureeAudio(wav(3.25, 24000, true), "prise.WAV"), 3.25);
});

test("durée d'un FLAC (STREAMINFO)", () => {
  assert.equal(mesurerDureeAudio(flac(12.5, 24000), "ref.flac"), 12.5);
});

/** Un MP3 synthétique : `n` trames MPEG1 couche III à 128 kbit/s, 44,1 kHz (417 octets, 1152 échantillons chacune). */
function mp3(n: number, options: { id3?: boolean; xing?: boolean } = {}): Uint8Array {
  const morceaux: number[][] = [];
  if (options.id3) morceaux.push([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0)]);
  const trame = (etiquette?: string) => {
    const t = new Array(417).fill(0);
    t[0] = 0xff;
    t[1] = 0xfb;
    t[2] = 0x90;
    if (etiquette) for (let i = 0; i < 4; i++) t[36 + i] = etiquette.charCodeAt(i);
    return t;
  };
  if (options.xing) morceaux.push(trame("Xing"));
  for (let i = 0; i < n; i++) morceaux.push(trame());
  return Uint8Array.from(morceaux.flat());
}

test("durée d'un MP3 : les trames sont comptées, après un bloc ID3 et sans la trame Xing", () => {
  assert.equal(mesurerDureeAudio(mp3(100), "voix.mp3"), 2.61); // 100 × 1152 / 44100
  assert.equal(mesurerDureeAudio(mp3(100, { id3: true }), "voix.MP3"), 2.61);
  assert.equal(mesurerDureeAudio(mp3(100, { xing: true }), "voix.mp3"), 2.61, "la trame Xing/Info ne porte pas de son");
  assert.equal(mesurerDureeAudio(mp3(1000), "voix.mp3"), 26.12);
});

test("format non mesurable ou fichier invalide : null, jamais une estimation", () => {
  assert.equal(mesurerDureeAudio(new Uint8Array(100), "prise.mp3"), null);
  assert.equal(mesurerDureeAudio(new Uint8Array(100), "prise.m4a"), null);
  assert.equal(mesurerDureeAudio(new Uint8Array(100), "prise.wav"), null);
  assert.equal(mesurerDureeAudio(new Uint8Array(10), "ref.flac"), null);
});

test("locuteur : personnage, voix seule, texte libre, invalide", () => {
  assert.deepEqual(decoderLocuteur("p:12"), { kind: "personnage", id: 12 });
  assert.deepEqual(decoderLocuteur("v:7"), { kind: "voix", id: 7 });
  assert.deepEqual(decoderLocuteur("t:Foule : un cri"), { kind: "texte", texte: "Foule : un cri" });
  assert.equal(decoderLocuteur("p:abc"), null);
  assert.equal(decoderLocuteur("t:  "), null);
  assert.equal(decoderLocuteur(""), null);
  assert.equal(nomLocuteur("CHAR_maya"), "maya");
});

test("langue de la balise : French -> Français", () => {
  assert.equal(langueBalise("French"), "Français");
  assert.equal(langueBalise("english"), "English");
  assert.equal(langueBalise(""), "Français");
});

test("prise obsolète quand le texte a changé depuis la prise", () => {
  assert.equal(priseObsolete({ fichier: null, fichierTexte: null, texte: "A" }), false);
  assert.equal(priseObsolete({ fichier: "x.wav", fichierTexte: "A", texte: "A " }), false);
  assert.equal(priseObsolete({ fichier: "x.wav", fichierTexte: "A", texte: "B" }), true);
});

test("corriger une balise ne touche pas au reste de la phrase", () => {
  const contenu = "Maya turns and says <d>[Français] Je reviens demain</d> before leaving.";
  const [b] = extraireBalisesD([{ section: "detailed_description", contenu }]);
  assert.ok(b);
  assert.equal(
    corrigerBalise(contenu, b, "Je reviens demain."),
    "Maya turns and says <d>[Français] Je reviens demain.</d> before leaving.",
  );
});

test("ajouter une balise en fin de section", () => {
  assert.equal(ajouterBalise("", "maya", "Français", "Oui."), "maya says, <d>[Français] Oui.</d>");
  assert.equal(ajouterBalise("Intro.\n", "maya", "Français", "Oui."), "Intro.\nmaya says, <d>[Français] Oui.</d>");
});

test("export CSV : guillemets et virgules échappés, plans en position:slot", () => {
  const csv = exportRepliquesCsv([
    {
      uuid: "u1",
      rang: 1,
      episodeNumero: 1,
      locuteur: "maya",
      voix: "VOICE_maya",
      texte: 'Elle dit "oui", puis part.',
      dureeSecondes: 3.5,
      statut: "validee",
      fichier: "repliques/1/u1.wav",
      plans: [{ planUuid: "p", position: 4, slot: 1 }],
    },
  ]);
  assert.equal(
    csv,
    'rang,uuid,episode,locuteur,voix,texte,duree_secondes,statut,fichier,plans\n1,u1,1,maya,VOICE_maya,"Elle dit ""oui"", puis part.",3.5,validee,repliques/1/u1.wav,04:1\n',
  );
});
