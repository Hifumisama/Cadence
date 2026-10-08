import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEME_REPLIQUE_ECOUTE, ecrireRepliqueEcoute, messageRepliqueEcoute, nettoyerRepliqueEcoute, nombrePhrases, repliqueDeRepli } from "./replique-ecoute";
import type { DemandeLlm, FournisseurLlm, ReponseLlm } from "./llm/types";

function faux(reponses: (string | Error)[]): FournisseurLlm & { demandes: DemandeLlm[] } {
  const demandes: DemandeLlm[] = [];
  return {
    nom: "faux",
    demandes,
    async generer(d) {
      demandes.push(d);
      const r = reponses[Math.min(demandes.length - 1, reponses.length - 1)]!;
      if (r instanceof Error) throw r;
      return { texte: r, usage: { entree: 0, sortie: 0 }, dureeMs: 0, modele: "m", brut: null } satisfies ReponseLlm;
    },
  };
}

test("nombrePhrases", () => {
  assert.equal(nombrePhrases("Bonjour."), 1);
  assert.equal(nombrePhrases("Bonjour. Entrez donc !"), 2);
  assert.equal(nombrePhrases("Bonjour… Entrez ? Oui. Non"), 4);
  assert.equal(nombrePhrases(""), 0);
});

test("nettoyage : réflexion, guillemets, markdown et préfixe retirés", () => {
  assert.equal(nettoyerRepliqueEcoute('<think>hmm</think>"Bonjour. Entrez."'), "Bonjour. Entrez.");
  assert.equal(nettoyerRepliqueEcoute("« Bonjour. Entrez. »"), "Bonjour. Entrez.");
  assert.equal(nettoyerRepliqueEcoute("Line: **Bonjour.**\n\nEntrez."), "Bonjour. Entrez.");
  assert.equal(nettoyerRepliqueEcoute("```\nHello there. Sit.\n```"), "Hello there. Sit.");
});

test("le message porte la langue (nom anglais), le caractère et l'instruction ; le système interdit un skill de structure JSON", () => {
  const m = messageRepliqueEcoute({ langue: "Français", caractere: "CHAR_maya : une vieille cartographe bourrue", instruction: "A gravelly native French speaker." });
  assert.match(m, /Language of the line: French/);
  assert.match(m, /Character: CHAR_maya/);
  assert.match(m, /Voice .*gravelly/);
  assert.match(SYSTEME_REPLIQUE_ECOUTE, /2 or 3 complete sentences/);
  assert.match(messageRepliqueEcoute({ langue: "fr" }), /not described/);
  assert.match(messageRepliqueEcoute({ langue: "klingon", role: "narrator" }), /language of the character description/);
});

test("écriture : la réplique du modèle est reprise, dans la langue de la voix, sans réflexion et sans skill", async () => {
  const f = faux(['"Je cartographie ces côtes depuis trente ans. Posez votre sac, et regardez la carte."']);
  const r = await ecrireRepliqueEcoute({ langue: "Français", caractere: "une cartographe" }, { fournisseur: f });
  assert.deepEqual(r, { texte: "Je cartographie ces côtes depuis trente ans. Posez votre sac, et regardez la carte.", langue: "French", source: "modele" });
  assert.equal(f.demandes.length, 1);
  assert.deepEqual(f.demandes[0]!.corps, { chat_template_kwargs: { enable_thinking: false } });
  assert.equal(f.demandes[0]!.schemaSortie, undefined, "texte libre, pas de schéma de skill");
});

test("écriture : une seule phrase est redemandée une fois", async () => {
  const f = faux(["Bonjour.", "Bonjour à vous. Entrez, je vous prie."]);
  const r = await ecrireRepliqueEcoute({ langue: "French" }, { fournisseur: f });
  assert.equal(r.texte, "Bonjour à vous. Entrez, je vous prie.");
  assert.equal(f.demandes.length, 2);
  // Toujours une seule phrase : on garde la seule disponible plutôt que d'échouer.
  const g = faux(["Bonjour.", "Salut."]);
  assert.equal((await ecrireRepliqueEcoute({ langue: "French" }, { fournisseur: g })).source, "modele");
});

test("écriture : modèle injoignable ou sortie vide → texte de repli dans la langue de la voix", async () => {
  const mort = faux([new Error("injoignable")]);
  const fr = await ecrireRepliqueEcoute({ langue: "French" }, { fournisseur: mort });
  assert.equal(fr.source, "repli");
  assert.equal(fr.langue, "French");
  assert.ok(nombrePhrases(fr.texte) >= 2);
  const vide = faux(["  "]);
  assert.equal((await ecrireRepliqueEcoute({ langue: "English" }, { fournisseur: vide })).source, "repli");
});

test("repli : sans texte dans la langue, l'anglais est annoncé comme tel (la langue envoyée au moteur suit le texte)", () => {
  assert.deepEqual([repliqueDeRepli("Japanese").langue, repliqueDeRepli("Japanese").source], ["English", "repli"]);
  assert.equal(repliqueDeRepli("fr").langue, "French");
});
