import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionsEffectives, type ContexteIteration } from "../agents/iteration-plan";
import { choisirReferences, type CandidatReference } from "./references-plan";
import { brutsManquants, decisionSortieReferencesPlan, deciderImages, deciderReferences, precedentEnAttente, retenirManquants, type EtatImageAsset } from "./preparation";

// Un registre générique (aucun nom de projet réel).
const registre: CandidatReference[] = [
  { code: "CHAR_ines", type: "personnage", label: "Inès", aUneImage: true },
  { code: "CHAR_marc", type: "personnage", label: "Marc", aUneImage: true },
  { code: "DEC_gare", type: "decor", label: "Gare", aUneImage: true },
  { code: "DEC_quai", type: "decor", label: "Quai", aUneImage: true },
  { code: "PROP_valise", type: "prop", label: "Valise", aUneImage: false },
];
const codesTypes = registre.map((c) => ({ code: c.code, type: c.type }));

// --- 1. références ------------------------------------------------------------------------------------------------------------------------

test("références déjà posées : gardées (chemin rapide, aucun appel de choix), sauf demande explicite de rechoisir", () => {
  assert.deepEqual(deciderReferences({ existantes: 2, rechoisir: false, precedentEnAttente: true, choix: null }), { action: "garder" });
  assert.deepEqual(deciderReferences({ existantes: 2, rechoisir: true, precedentEnAttente: false, choix: { suffit: true, references: ["CHAR_ines"] } }), { action: "ecrire", codes: ["CHAR_ines"] });
});

test("plan neuf : le code écrit seul quand il n'a aucun doute ; un doute (ou rien de trouvé) appelle le skill", () => {
  assert.deepEqual(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: false, choix: { suffit: true, references: ["CHAR_ines", "DEC_gare"] } }), { action: "ecrire", codes: ["CHAR_ines", "DEC_gare"] });
  assert.deepEqual(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: false, choix: { suffit: false, references: ["CHAR_ines"] } }), { action: "skill" });
  assert.deepEqual(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: false, choix: { suffit: true, references: [] } }), { action: "skill" });
  assert.equal(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: false, choix: null }).action, "echec");
});

test("ordre du scénario : un plan attend qu'un plan plus tôt ait fini ses références ; jamais un plan plus tard", () => {
  assert.equal(precedentEnAttente(5, [{ ordre: 3, referencesFinies: false }]), true);
  assert.equal(precedentEnAttente(5, [{ ordre: 3, referencesFinies: true }, { ordre: 8, referencesFinies: false }]), false);
  assert.deepEqual(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: true, choix: null }), { action: "attendre" });
});

test("plan lié (suite, même scène) : le décor du plan précédent est repris, sans doute ni skill", () => {
  const r = choisirReferences({
    description: "Inès pose la valise et regarde au loin.",
    liaison: "suite",
    precedent: { memeScene: true, decor: "DEC_quai" },
    candidats: registre,
  });
  assert.deepEqual(r.doutes, []);
  assert.ok(r.references.some((x) => x.code === "DEC_quai"));
  assert.deepEqual(deciderReferences({ existantes: 0, rechoisir: false, precedentEnAttente: false, choix: { suffit: r.suffit, references: r.references.map((x) => x.code) } }).action, "ecrire");
  // Coupe franche : le décor du précédent ne sert pas, le code doute (aucun décor nommé) → skill.
  const coupe = choisirReferences({ description: "Inès pose la valise.", liaison: "coupe", precedent: { memeScene: true, decor: "DEC_quai" }, candidats: registre });
  assert.equal(coupe.suffit, false);
});

// --- 2. assets manquants ------------------------------------------------------------------------------------------------------------------

test("manquants : deux au plus, code reconstruit, type permis, parent valide ; un code existant est une référence", () => {
  const r = retenirManquants(
    [
      { code: "prop_lanterne", type: "prop", description: "Une lanterne de cuivre." },
      { code: "DEC_gare_nuit", type: "decor", parent: "DEC_gare", description: "La gare la nuit." },
      { code: "CHAR_controleur", type: "personnage", parent: "DEC_gare", description: "Un contrôleur." },
      { code: "VFX_fumee", type: "vfx", description: "Fumée." },
      { code: "SFX_sifflet", type: "sfx", description: "Sifflet." },
      { code: "CHAR_marc", type: "personnage", description: "déjà là" },
    ],
    codesTypes,
  );
  assert.deepEqual(r.retenus.map((m) => [m.code, m.parent]), [["PROP_lanterne", null], ["DEC_gare_nuit", "DEC_gare"]]);
  assert.deepEqual(r.existants, ["CHAR_marc"]);
  assert.ok(r.ecartes.some((e) => e.code === "CHAR_controleur" && /au plus 2/.test(e.raison)), "le troisième est écarté (à créer à la main)");
  assert.ok(r.ecartes.some((e) => e.code === "VFX_fumee"));
  assert.ok(r.ecartes.some((e) => e.code === "SFX_sifflet"));
  // La place sur le plan limite aussi : 6 images au plus, références comprises.
  assert.equal(retenirManquants([{ code: "PROP_a", type: "prop" }, { code: "PROP_b", type: "prop" }], codesTypes, { place: 1 }).retenus.length, 1);
  // Un parent d'un autre type n'est pas gardé.
  assert.equal(retenirManquants([{ code: "CHAR_x", type: "personnage", parent: "DEC_gare" }], codesTypes).retenus[0]!.parent, null);
});

test("manquants → créations d'assets cochables (clé de nouvel asset, parent existant)", () => {
  const [b] = brutsManquants([{ code: "DEC_gare_nuit", type: "decor", parent: "DEC_gare", description: "La gare la nuit.", raison: "le plan est de nuit" }]);
  assert.equal(b!.cibleType, "asset");
  assert.equal(b!.operation, "creer");
  assert.equal(b!.cle, "nouvel-asset-DEC_gare_nuit");
  assert.deepEqual(b!.apres, { type: "decor", suffixe: "gare_nuit", description: "La gare la nuit.", deriveDeCode: "DEC_gare" });
});

test("sortie du skill : codes rapprochés, sons écartés, manquants plafonnés ; rejouée après création, les manquants deviennent des références", () => {
  const sortie = {
    references: [{ code: "CHAR_ines" }, { code: "SFX_x" }, { code: "DEC_gare" }, { code: "CHAR_ines" }],
    manquants: [
      { code: "PROP_lanterne", type: "prop", description: "Lanterne." },
      { code: "PROP_billet", type: "prop", description: "Billet." },
      { code: "PROP_montre", type: "prop", description: "Montre." },
    ],
  };
  const avant = decisionSortieReferencesPlan(sortie, codesTypes);
  assert.deepEqual(avant.references, ["CHAR_ines", "DEC_gare"]);
  assert.deepEqual(avant.manquants.map((m) => m.code), ["PROP_lanterne", "PROP_billet"]);
  const apres = decisionSortieReferencesPlan(sortie, [...codesTypes, { code: "PROP_lanterne", type: "prop" }, { code: "PROP_billet", type: "prop" }]);
  assert.deepEqual(apres.references, ["CHAR_ines", "DEC_gare", "PROP_lanterne", "PROP_billet"]);
  // (À l'application, seules les références comptent : le manquant écarté au premier passage n'est jamais créé.)
});

// --- 3-4. prompts et images ----------------------------------------------------------------------------------------------------------------

const asset = (code: string, o: Partial<EtatImageAsset> = {}): EtatImageAsset => ({ code, nom: code, aFichier: false, aPrompt: true, enFile: false, echec: null, ...o });

test("images : prêt quand tout a son fichier ; sinon prompts d'abord, puis lancement et attente ; un échec nomme l'asset", () => {
  assert.deepEqual(deciderImages([asset("A", { aFichier: true })]), { action: "pret", total: 1 });
  assert.deepEqual(deciderImages([asset("A", { aFichier: true }), asset("B", { aPrompt: false })]), { action: "prompts", codes: ["B"] });
  assert.deepEqual(deciderImages([asset("A", { aFichier: true }), asset("B"), asset("C", { enFile: true })]), { action: "attendre", faites: 1, total: 3, aLancer: ["B"] });
  const e = deciderImages([asset("B", { nom: "Valise", echec: "ComfyUI injoignable" })]);
  assert.equal(e.action, "echec");
  assert.match((e as { erreur: string }).erreur, /« Valise » a échoué : ComfyUI injoignable/);
  // Une génération en échec mais relancée (en file) n'arrête rien.
  assert.equal(deciderImages([asset("B", { echec: "x", enFile: true })]).action, "attendre");
});

// --- itération : les manquants décidés -------------------------------------------------------------------------------------------------------

test("itérer : des manquants seuls font une décision (créés puis recompilés), deux au plus et dans les six images", () => {
  const ctx: ContexteIteration = {
    description: "Inès attend sur le quai.",
    refs: [{ type: "picture", slot: 1, asset: "CHAR_ines" }, { type: "picture", slot: 2, asset: "DEC_quai" }],
    registre: codesTypes,
    dureeGenerationSecondes: 6,
  };
  const sortie = {
    decisions: {
      nouvelleDescription: "",
      dureeSecondes: null,
      references: { ajouter: [], retirer: [] },
      manquants: [
        { code: "PROP_lanterne", type: "prop", description: "Lanterne.", raison: "elle tient une lanterne" },
        { code: "PROP_billet", type: "prop", description: "Billet.", raison: "x" },
        { code: "PROP_montre", type: "prop", description: "Montre.", raison: "y" },
      ],
      reglages: { creativite: null, styleMiseEnScene: null },
    },
  };
  const d = decisionsEffectives(sortie, ctx);
  assert.deepEqual(d?.manquants?.map((m) => m.code), ["PROP_lanterne", "PROP_billet"]);
  // Plan déjà à six images : aucune place, aucun manquant retenu, rien à recompiler.
  const plein = { ...ctx, refs: Array.from({ length: 6 }, (_, i) => ({ type: "picture" as const, slot: i + 1, asset: `CHAR_${i}` })) };
  assert.equal(decisionsEffectives(sortie, plein), null);
});
