import assert from "node:assert/strict";
import { test } from "node:test";
import type { EtatDansLaFile } from "../lib/annulation";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import type { ComfyUIClient } from "./comfyui/types";

/** Faux ComfyUI : `etats` est la suite d'états que renverra /queue (le dernier se
 * répète). Compte les gestes faits. */
function faux(etats: EtatDansLaFile[], reussite = true) {
  const appels = { interrompre: 0, retirer: 0, etat: 0 };
  const client = {
    async etatDansLaFile() {
      const e = etats[Math.min(appels.etat, etats.length - 1)]!;
      appels.etat++;
      return e;
    },
    async interrompre() {
      appels.interrompre++;
      return reussite;
    },
    async retirerDeLaFile() {
      appels.retirer++;
      return reussite;
    },
  } as unknown as ComfyUIClient;
  return { client, appels };
}

const vite = { pauseMs: 1 };

test("en cours : interrompu une fois, puis on constate qu'il a quitté la file", async () => {
  const { client, appels } = faux(["en_cours", "en_cours", "absent"]);
  assert.equal(await annulerCoteComfyUI(client, "p", vite), "interrompue");
  // Une seule interruption même si ComfyUI met un tour à s'arrêter : un second
  // /interrupt pourrait couper la tâche suivante.
  assert.equal(appels.interrompre, 1);
  assert.equal(appels.retirer, 0);
});

test("en file : retiré de la file de ComfyUI, sans interruption", async () => {
  const { client, appels } = faux(["en_file", "absent"]);
  assert.equal(await annulerCoteComfyUI(client, "p", vite), "retiree");
  assert.equal(appels.retirer, 1);
  assert.equal(appels.interrompre, 0);
});

test("absent : rien à couper, aucun appel (déjà fini, ou jamais arrivé)", async () => {
  const { client, appels } = faux(["absent"]);
  assert.equal(await annulerCoteComfyUI(client, "p", vite), "rien");
  assert.equal(appels.interrompre + appels.retirer, 0);
});

test("/queue muet ou illisible : on ne coupe RIEN à l'aveugle", async () => {
  const { client, appels } = faux(["inconnu"]);
  assert.equal(await annulerCoteComfyUI(client, "p", { passes: 4, pauseMs: 1 }), "sans_effet");
  assert.equal(appels.interrompre, 0);
  assert.equal(appels.retirer, 0);
  assert.equal(appels.etat, 4);
});

test("inconnu puis en cours : on agit dès qu'on sait", async () => {
  const { client, appels } = faux(["inconnu", "en_cours", "absent"]);
  assert.equal(await annulerCoteComfyUI(client, "p", vite), "interrompue");
  assert.equal(appels.interrompre, 1);
});

test("surveillance : se résout quand le drapeau est posé, et s'arrête sur demande", async () => {
  let pose = false;
  let lectures = 0;
  const s = surveillerAnnulation(async () => {
    lectures++;
    return pose;
  }, 5);
  setTimeout(() => {
    pose = true;
  }, 20);
  assert.equal(await s.promesse, "annulee");
  s.arreter();

  // Arrêtée avant le drapeau : plus aucune lecture.
  let n = 0;
  const t = surveillerAnnulation(async () => {
    n++;
    return false;
  }, 5);
  await new Promise((r) => setTimeout(r, 30));
  t.arreter();
  const apres = n;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(n, apres);
  assert.ok(lectures > 0);
});

test("surveillance : une erreur de lecture n'est pas une demande d'annulation", async () => {
  let tour = 0;
  const s = surveillerAnnulation(async () => {
    tour++;
    if (tour < 3) throw new Error("base indisponible");
    return true;
  }, 3);
  assert.equal(await s.promesse, "annulee");
  assert.ok(tour >= 3);
  s.arreter();
});
