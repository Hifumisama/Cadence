import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { test } from "node:test";
import { limiteur } from "./limiteur";
import type { EvenementSuivi } from "./types";
import { decoderBinaire, decoderTexte } from "./wsDecodage";
import { ouvrirSuiviWs, type EtatHistorique } from "./wsSuivi";

// Faux serveur WebSocket minimal (poignée de main + trames serveur → client) :
// pas de dépendance, et on contrôle exactement ce qui part, y compris les
// messages inconnus et les coupures.

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function trame(opcode: number, charge: Buffer): Buffer {
  const n = charge.length;
  const tete = n < 126 ? Buffer.from([0x80 | opcode, n]) : Buffer.from([0x80 | opcode, 126, n >> 8, n & 0xff]);
  return Buffer.concat([tete, charge]);
}

async function fauxServeur() {
  const clients: Socket[] = [];
  const urls: string[] = [];
  const http: Server = createServer();
  http.on("upgrade", (req, socket: Socket) => {
    urls.push(req.url ?? "");
    const cle = String(req.headers["sec-websocket-key"]);
    const accept = createHash("sha1").update(cle + GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on("error", () => undefined);
    socket.on("data", () => undefined);
    clients.push(socket);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const port = (http.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    urls,
    json: (type: string, data: unknown) => clients.forEach((c) => c.write(trame(1, Buffer.from(JSON.stringify({ type, data }))))),
    binaire: (octets: Buffer) => clients.forEach((c) => c.write(trame(2, octets))),
    coupe: () => clients.forEach((c) => c.destroy()),
    ferme: () => {
      clients.forEach((c) => c.destroy());
      http.close();
    },
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);

function entete(type: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(type);
  return b;
}
const u32 = (n: number) => entete(n);

test("décodage binaire : aperçu simple, avec métadonnées, type inconnu, tronqué", () => {
  // type 1 : [format 4 o] + image
  const simple = decoderBinaire(Buffer.concat([entete(1), u32(2), PNG]));
  assert.equal(simple?.apercu?.format, "png");
  assert.deepEqual(simple?.apercu?.octets, PNG);

  // type 4 : [longueur] + JSON + [format 4 o] + image
  const meta = Buffer.from(JSON.stringify({ prompt_id: "p1", display_node_id: "30:3" }));
  const avec = decoderBinaire(Buffer.concat([entete(4), u32(meta.length), meta, u32(1), JPEG]));
  assert.equal(avec?.promptId, "p1");
  assert.equal(avec?.noeud, "30:3");
  assert.equal(avec?.apercu?.format, "jpeg");
  // même chose sans l'octet de format après les métadonnées
  const sans = decoderBinaire(Buffer.concat([entete(4), u32(meta.length), meta, JPEG]));
  assert.equal(sans?.apercu?.format, "jpeg");

  const inconnu = decoderBinaire(Buffer.concat([entete(99), Buffer.from("n'importe quoi")]));
  assert.equal(inconnu?.evenement, 99);
  assert.equal(inconnu?.apercu, undefined);

  assert.equal(decoderBinaire(Buffer.from([0, 0])), null);
  const tronque = decoderBinaire(Buffer.concat([entete(4), u32(5000), Buffer.from("{}")]));
  assert.equal(tronque?.apercu, undefined);
});

test("décodage texte : événements utiles, bruit ignoré", () => {
  assert.deepEqual(decoderTexte('{"type":"execution_start","data":{"prompt_id":"p"}}')?.evenement, { type: "demarre" });
  assert.deepEqual(decoderTexte('{"type":"progress","data":{"value":3,"max":8,"node":"30:3","prompt_id":"p"}}')?.evenement, {
    type: "progression",
    valeur: 3,
    max: 8,
    noeud: "30:3",
  });
  assert.equal(decoderTexte('{"type":"status","data":{}}')?.evenement, null);
  assert.equal(decoderTexte('{"type":"executing","data":{"node":null,"prompt_id":"p"}}')?.evenement, null);
  assert.equal(decoderTexte("pas du json"), null);
  const erreur = decoderTexte('{"type":"execution_error","data":{"node_type":"KSampler","exception_message":"OOM","prompt_id":"p"}}');
  assert.deepEqual(erreur?.evenement, { type: "erreur", message: "KSampler : OOM" });
});

test("limiteur : au plus un passage par intervalle", () => {
  let t = 0;
  const ok = limiteur(1000, () => t);
  assert.equal(ok(), true);
  t = 400;
  assert.equal(ok(), false);
  t = 1000;
  assert.equal(ok(), true);
});

const enCours = async (): Promise<EtatHistorique> => "en_cours";

test("suivi : séquence réaliste avec message binaire et JSON inconnus, jusqu'à la fin", async () => {
  const srv = await fauxServeur();
  const recus: EvenementSuivi[] = [];
  try {
    const suivi = await ouvrirSuiviWs({ baseUrl: srv.baseUrl, clientId: "abc", surEvenement: (e) => recus.push(e), etatHistorique: enCours });
    assert.equal(srv.urls[0], "/ws?clientId=abc");
    const attente = suivi.attendre("p1", 5_000);
    await pause(50);

    srv.json("status", { status: { exec_info: { queue_remaining: 1 } } });
    srv.json("execution_start", { prompt_id: "p1" });
    srv.json("executing", { node: "30:3", prompt_id: "p1" });
    srv.json("progress", { value: 1, max: 8, node: "30:3", prompt_id: "p1" });
    srv.binaire(Buffer.concat([entete(99), Buffer.from("inconnu")]));
    srv.json("un_type_futur", { x: 1 });
    srv.binaire(Buffer.concat([entete(1), u32(2), PNG]));
    srv.json("progress", { value: 2, max: 8, node: "30:3", prompt_id: "autre" }); // autre prompt : ignoré
    srv.json("progress", { value: 8, max: 8, node: "30:3", prompt_id: "p1" });
    srv.json("execution_success", { prompt_id: "p1" });

    assert.equal(await attente, "termine");
    const types = recus.map((e) => e.type);
    assert.deepEqual(types, ["demarre", "noeud", "progression", "apercu", "progression", "termine"]);
    const prog = recus.filter((e) => e.type === "progression");
    assert.deepEqual(prog.map((e) => (e.type === "progression" ? e.valeur : -1)), [1, 8]);
    suivi.fermer();
  } finally {
    srv.ferme();
  }
});

test("suivi : coupure du WebSocket en cours de route", async () => {
  const srv = await fauxServeur();
  try {
    const suivi = await ouvrirSuiviWs({ baseUrl: srv.baseUrl, clientId: "x", surEvenement: () => undefined, etatHistorique: enCours });
    const attente = suivi.attendre("p1", 5_000);
    await pause(50);
    srv.json("execution_start", { prompt_id: "p1" });
    srv.coupe();
    assert.equal(await attente, "coupure");
  } finally {
    srv.ferme();
  }
});

test("suivi : fin manquée par le WebSocket, confirmée par /history", async () => {
  const srv = await fauxServeur();
  try {
    const suivi = await ouvrirSuiviWs({
      baseUrl: srv.baseUrl,
      clientId: "x",
      surEvenement: () => undefined,
      etatHistorique: async () => "termine",
    });
    assert.equal(await suivi.attendre("p1", 5_000), "termine");
    suivi.fermer();
  } finally {
    srv.ferme();
  }
});

test("suivi : /history rattrape une fin que le WebSocket n'a pas annoncée (vérification périodique)", async () => {
  const srv = await fauxServeur();
  let appels = 0;
  try {
    const suivi = await ouvrirSuiviWs({
      baseUrl: srv.baseUrl,
      clientId: "x",
      surEvenement: () => undefined,
      etatHistorique: async () => (++appels >= 3 ? "erreur" : "en_cours"),
      intervalleHistoriqueMs: 30,
    });
    assert.equal(await suivi.attendre("p1", 5_000), "erreur");
    suivi.fermer();
  } finally {
    srv.ferme();
  }
});

test("suivi : délai dépassé", async () => {
  const srv = await fauxServeur();
  try {
    const suivi = await ouvrirSuiviWs({ baseUrl: srv.baseUrl, clientId: "x", surEvenement: () => undefined, etatHistorique: enCours, intervalleHistoriqueMs: 20 });
    assert.equal(await suivi.attendre("p1", 120), "delai");
    suivi.fermer();
  } finally {
    srv.ferme();
  }
});

test("suivi : serveur injoignable → coupure, sans exception", async () => {
  const suivi = await ouvrirSuiviWs({
    baseUrl: "http://127.0.0.1:1",
    clientId: "x",
    surEvenement: () => undefined,
    etatHistorique: enCours,
    delaiOuvertureMs: 1_000,
  });
  assert.equal(await suivi.attendre("p1", 1_000), "coupure");
});
