import assert from "node:assert/strict";
import { test } from "node:test";
import { controlerSortiePlanH3, decouperShots, resumeControles, secondesDeTimecode, type SortiePlanH3 } from "./plan-h3-controles";

const ctx = {
  registre: [
    { code: "CHAR_maya", type: "personnage" },
    { code: "DEC_couloir", type: "decor" },
    { code: "SFX_porte", type: "sfx" },
    { code: "VOX_maya", type: "voix" },
  ],
};

const bonne: SortiePlanH3 = {
  titre: "Le couloir",
  dureeSecondes: 10,
  references: [
    { asset: "CHAR_maya", nature: "image", role: "Maya", nom: "Maya", definition: "walking slowly" },
    { asset: "DEC_couloir", nature: "image", role: "Décor", nom: "the corridor", definition: "dimly lit" },
  ],
  summary: "[[CHAR_maya]] walks through [[DEC_couloir]].",
  ouverture: "Cinematic style, cold light.",
  shots: [
    { debutSecondes: 0, texte: "A low static shot follows [[CHAR_maya]] in [[DEC_couloir]]. She (S1) says <d>[French] Encore du sel.</d>" },
    { debutSecondes: 5, texte: "a close-up on her hands." },
  ],
  overall_soundscape: "Drip.",
  non_diegetic_music: "N/A",
  assetsManquants: [],
  notes: "",
};

const erreurs = (s: SortiePlanH3, c = ctx) => controlerSortiePlanH3(s, c).filter((x) => x.niveau === "erreur").map((x) => x.regle);

test("timecodes : formats acceptés et refusés", () => {
  assert.equal(secondesDeTimecode("00:04.500"), 4.5);
  assert.equal(secondesDeTimecode("01:02"), 62);
  assert.equal(secondesDeTimecode("abc"), null);
});

test("shots d'un prompt assemblé : découpage, numéros, timecodes, hard cut", () => {
  const s = decouperShots("[Shot 1] a [Shot 2] At 00:05.000, Hard cut to b");
  assert.deepEqual(s.map((x) => x.numero), [1, 2]);
  assert.equal(s[0]!.timecode, null);
  assert.equal(s[1]!.timecode, 5);
  assert.equal(s[1]!.hardCut, true);
});

test("un brouillon conforme ne produit aucune erreur", () => {
  assert.deepEqual(resumeControles(controlerSortiePlanH3(bonne, ctx)), { erreurs: 0, alertes: 0, infos: 0 });
});

test("durée, asset inventé, label écrit à la main, jeton {picture}", () => {
  const mauvaise: SortiePlanH3 = {
    ...bonne,
    dureeSecondes: 4,
    references: [{ asset: "PROP_lettre", nature: "image", role: "x", nom: "a letter", definition: "lying <Picture 1> {picture}" }],
    summary: "[[PROP_lettre]] and <Subject 1>",
  };
  const r = erreurs(mauvaise);
  for (const attendu of ["duree", "asset-inconnu", "labels", "jeton"]) assert.ok(r.includes(attendu), attendu);
});

test("marqueur hors références, asset manquant cité, référence non citée, plus de 6 images", () => {
  const p = controlerSortiePlanH3({ ...bonne, shots: [{ debutSecondes: 0, texte: "[[CHAR_x]] in [[DEC_couloir]], [[PROP_lettre]]." }, bonne.shots[1]!], assetsManquants: [{ code: "PROP_lettre", type: "prop", description: "une lettre", raison: "absente" }] }, ctx);
  assert.ok(p.some((x) => x.regle === "placeholder" && x.message.includes("CHAR_x")));
  assert.ok(p.some((x) => x.regle === "placeholder" && x.message.includes("PROP_lettre") && x.message.includes("pas dans les références")), "un asset manquant cité sans être déclaré en référence");
  assert.ok(p.some((x) => x.niveau === "info" && x.message.includes("PROP_lettre")));
  const nonCitee = controlerSortiePlanH3({ ...bonne, summary: "A walk.", shots: [{ debutSecondes: 0, texte: "[[DEC_couloir]]" }, bonne.shots[1]!] }, ctx);
  assert.ok(nonCitee.some((x) => x.niveau === "alerte" && x.regle === "reference-non-citee" && x.message.includes("CHAR_maya")));
  const trop = { ...bonne, references: Array.from({ length: 7 }, (_, i) => ({ asset: `CHAR_maya`, nature: "image" as const, role: "r", nom: `n${i}`, definition: "" })) };
  assert.ok(erreurs(trop).includes("references"));
});

test("natures : un son est un sfx ; un sfx ou une voix n'a pas d'image ; les slots audio suivent les voix", () => {
  const son = { asset: "SFX_porte", nature: "son" as const, role: "Porte", nom: "a door slam", definition: "" };
  const avec = (references: SortiePlanH3["references"], c = ctx) => erreurs({ ...bonne, references, summary: "[[CHAR_maya]] [[SFX_porte]]" }, c);
  assert.deepEqual(avec([...bonne.references, son]), []);
  assert.ok(avec([{ ...son, asset: "CHAR_maya" }]).includes("nature"), "personnage en nature son");
  assert.ok(avec([{ ...son, nature: "image" }]).includes("nature"), "sfx en nature image");
  assert.ok(avec([{ ...son, asset: "VOX_maya", nature: "image" }]).includes("nature"), "voix en référence");
  const troisVoix = { ...ctx, slotsAudioPris: [1, 2, 3] };
  assert.ok(erreurs({ ...bonne, references: [bonne.references[0]!, son], summary: "[[CHAR_maya]] [[SFX_porte]]", shots: [{ debutSecondes: 0, texte: "a <d>a</d> b c [[CHAR_maya]] [[SFX_porte]]" }] }, troisVoix).includes("references"), "la voix prime");
});

test("shots : début non nul, non croissant, au-delà de la durée, vide (erreurs)", () => {
  const avec = (shots: SortiePlanH3["shots"]) => controlerSortiePlanH3({ ...bonne, shots }, ctx).filter((x) => x.niveau === "erreur" && x.regle === "shots");
  const t = (debutSecondes: number) => ({ debutSecondes, texte: "[[CHAR_maya]] [[DEC_couloir]]" });
  assert.ok(avec([t(1), t(5)]).length > 0, "premier shot non nul");
  assert.ok(avec([t(0), t(5), t(4)]).length > 0, "non croissant");
  assert.ok(avec([t(0), t(12)]).length > 0, "au-delà de la durée");
  assert.equal(avec([]).length, 1, "aucun shot");
  assert.equal(avec([t(0), t(3), t(6)]).length, 0, "conforme");
});

test("shots sous 1,5 s : une ALERTE (conseil fort), jamais une erreur qui renvoie le modèle", () => {
  const tous = (shots: SortiePlanH3["shots"]) => controlerSortiePlanH3({ ...bonne, shots }, ctx);
  const t = (debutSecondes: number) => ({ debutSecondes, texte: "[[CHAR_maya]] [[DEC_couloir]]" });
  for (const [shots, quoi] of [[[t(0), t(1), t(4)], "shot trop court"], [[t(0), t(9.5)], "dernier shot trop court"]] as const) {
    const p = tous([...shots]);
    assert.ok(p.some((x) => x.niveau === "alerte" && x.regle === "shot-court"), `${quoi} : alerte`);
    assert.ok(!p.some((x) => x.niveau === "erreur" && x.regle === "shots"), `${quoi} : pas d'erreur`);
  }
  assert.ok(!tous([t(0), t(3), t(6)]).some((x) => x.regle === "shot-court"), "conforme : rien");
});

test("prompt trop long (au-delà de 7 000 caractères) : une ALERTE, jamais une erreur", () => {
  const long = Array.from({ length: 1300 }, (_, i) => `mot${i}`).join(" ");
  const p = controlerSortiePlanH3({ ...bonne, shots: [{ debutSecondes: 0, texte: `[[CHAR_maya]] [[DEC_couloir]] (S1) <d>[French] Encore du sel.</d> ${long}` }, bonne.shots[1]!] }, ctx);
  assert.ok(p.some((x) => x.niveau === "alerte" && x.regle === "prompt-long"), "alerte de longueur");
  assert.ok(!p.some((x) => x.niveau === "erreur" && x.regle === "prompt-long"), "pas une erreur");
  assert.ok(!controlerSortiePlanH3(bonne, ctx).some((x) => x.regle === "prompt-long"), "un plan court : rien");
});

test("numérotation des locuteurs : un trou et un numéro partagé donnent une alerte, jamais une erreur", () => {
  const avec = (...textes: string[]) => ({ ...bonne, shots: textes.map((texte, i) => ({ debutSecondes: i * 5, texte })) });
  const regles = (s: SortiePlanH3) => controlerSortiePlanH3(s, ctx).filter((x) => x.niveau === "alerte").map((x) => x.regle);
  // S1 puis S3 : il manque S2
  const trou = avec("[[CHAR_maya]] (S1) says <d>[French] Encore du sel.</d>", "[[CHAR_maya]] (S3) says <d>[French] Vraiment.</d>");
  assert.ok(regles(trou).includes("locuteur-numerotation"));
  assert.equal(erreurs(trou).includes("locuteur-numerotation"), false);
  // deux personnages sous (S1)
  const partage = avec("[[CHAR_maya]] (S1) says <d>[French] Encore du sel.</d>", "[[CHAR_tenanciere]] with a deep voice (S1) says <d>[French] Non.</d>");
  assert.ok(regles(partage).includes("locuteur-partage"));
  // numérotation continue, même personnage qui reprend la parole, plusieurs locuteurs à la fois : rien
  const bon = avec("[[CHAR_maya]] (S1) says <d>[French] Encore du sel.</d> then [[CHAR_tenanciere]] with a deep voice (S2) says <d>[French] Non.</d>", "[[CHAR_maya]] (S1) and [[CHAR_tenanciere]] (S1,S2) speak at once.");
  assert.ok(!regles(bon).includes("locuteur-numerotation") && !regles(bon).includes("locuteur-partage"));
  // un plan sans locuteur, ou un numéro séparé de son personnage par une phrase : rien
  assert.ok(!regles(bonne).some((r) => r.startsWith("locuteur-")));
  assert.ok(!regles(avec("[[CHAR_maya]] walks. A voice in the dark (S1) says <d>[French] Ici.</d>", "[[CHAR_tenanciere]] listens. The voice again (S1).")).includes("locuteur-partage"));
});

test("balisage : coupe ou timecode écrits par le modèle ; [Shot N] et titres de section recopiés", () => {
  const p = (texte: string) => controlerSortiePlanH3({ ...bonne, shots: [bonne.shots[0]!, { debutSecondes: 5, texte }] }, ctx);
  // retirables à l'assemblage : alerte
  for (const t of ["Hard cut to a close-up [[CHAR_maya]].", "a hard cut to a close-up [[CHAR_maya]].", "a sudden cut to a close-up.", "the shot cuts to a close-up.", "At 00:05.000, a close-up."]) {
    assert.ok(p(t).some((x) => x.regle === "balisage" && x.niveau === "alerte"), t);
  }
  // non retirables sans casser la phrase : erreur (renvoi)
  for (const t of ["a final hard cut shows [[CHAR_maya]].", "Hard cut. A close-up."]) {
    assert.ok(p(t).some((x) => x.regle === "balisage" && x.niveau === "erreur"), t);
  }
  assert.equal(p("a close-up of [[CHAR_maya]], hands.").filter((x) => x.regle === "balisage").length, 0);
  assert.ok(p("a close-up. [Shot 3] more").some((x) => x.regle === "shots" && x.niveau === "erreur"));
  assert.ok(p("a close-up.\noverall_soundscape: rain").some((x) => x.regle === "fuite" && x.niveau === "erreur"));
});

test("rétention : un niveau d'image ne va pas à un son, et inversement", () => {
  const son = { asset: "SFX_porte", nature: "son" as const, role: "Porte", nom: "a door slam", definition: "", retention: "fully_preserved" };
  const r = (references: SortiePlanH3["references"]) => erreurs({ ...bonne, references, summary: "[[CHAR_maya]] [[DEC_couloir]] [[SFX_porte]]" });
  assert.ok(r([...bonne.references, son]).includes("retention"));
  assert.ok(r([{ ...bonne.references[0]!, retention: "fully_copy" }, bonne.references[1]!]).includes("retention"));
  assert.ok(!r([{ ...bonne.references[0]!, retention: "weak_reference" }, bonne.references[1]!]).includes("retention"));
});

test("recopie : une phrase de 10 mots identique à un exemple donne une alerte", () => {
  const corpus = ["Heavy, uneven footsteps splash against wet cobblestones, the distant echo of a slamming door fading behind her."];
  const avec = (overall_soundscape: string) => controlerSortiePlanH3({ ...bonne, overall_soundscape }, { ...ctx, corpusExemples: corpus }).filter((x) => x.regle === "recopie");
  assert.equal(avec("Heavy, uneven footsteps splash against wet cobblestones, the distant echo of a slamming door fading behind her, then silence.").length, 1);
  assert.equal(avec("Footsteps on wet stone, a door slams far away.").length, 0);
  // l'ouverture reprend la clause de style du projet : jamais signalée
  const style = "Cinematic anime style, refined linework, cold moonlight against deep shadow, faint blue haze.";
  assert.equal(controlerSortiePlanH3({ ...bonne, ouverture: style }, { ...ctx, corpusExemples: [style] }).filter((x) => x.regle === "recopie").length, 0);
});

test("dialogue : le prompt est la seule source, un <d> libre n'est jamais contesté (2026-10-14)", () => {
  const libre = controlerSortiePlanH3({ ...bonne, shots: [{ ...bonne.shots[0]!, texte: bonne.shots[0]!.texte.replace("Encore du sel.", "Une toute autre parole.") }, bonne.shots[1]!] }, ctx);
  assert.ok(!libre.some((x) => x.regle === "verbatim" || x.regle === "dialogue"));
});

test("notes de l'agent : remontées en information ; mots par seconde en alerte", () => {
  const p = controlerSortiePlanH3({ ...bonne, notes: "Geste continu assumé.", summary: bonne.summary + " about 3 words per second" }, ctx);
  assert.ok(p.some((x) => x.niveau === "info" && x.message.includes("Geste continu")));
  assert.ok(p.some((x) => x.regle === "mots-seconde"));
});

test("définition : « is … » est refusé, « island … » ne l'est pas", () => {
  const avec = (definition: string) => controlerSortiePlanH3({ ...bonne, references: [{ ...bonne.references[0]!, definition }, bonne.references[1]!] }, ctx).filter((x) => x.regle === "definition");
  assert.equal(avec("is walking").length, 1);
  assert.equal(avec("island of calm, walking").length, 0);
});

test("un dialogue <d> sans locuteur (S1) donne une alerte, pas une erreur", () => {
  const sans: SortiePlanH3 = {
    ...bonne,
    shots: [{ debutSecondes: 0, texte: "A low static shot follows [[CHAR_maya]] in [[DEC_couloir]]. She says <d>[French] Encore du sel.</d>" }, bonne.shots[1]!],
  };
  const r = controlerSortiePlanH3(sans, ctx);
  assert.ok(r.some((x) => x.regle === "locuteur" && x.niveau === "alerte"));
  assert.equal(erreurs(sans).includes("locuteur"), false);
});

test("voix off : un <d> « off-screen voiceover » sans bouche close juste après est signalé", () => {
  const base = { titre: "t", dureeSecondes: 8, references: [], summary: "s", ouverture: "o", overall_soundscape: "x", non_diegetic_music: "N/A", assetsManquants: [], notes: "" };
  const ctx = { registre: [] };
  const sans = controlerSortiePlanH3({ ...base, shots: [{ debutSecondes: 0, texte: "a close-up of Mai (S1) says in an off-screen voiceover: <d>[Français] Concentre-toi.</d> Her eyes are closed." }] }, ctx);
  assert.ok(sans.some((p) => p.regle === "voix-off"));
  const avec = controlerSortiePlanH3({ ...base, shots: [{ debutSecondes: 0, texte: "a close-up of Mai (S1) says in an off-screen voiceover: <d>[Français] Concentre-toi.</d> while her lips remain completely closed." }] }, ctx);
  assert.ok(!avec.some((p) => p.regle === "voix-off"));
});

test("asset d'image manquant : cité comme une référence (déclaré dans assetsManquants), sans erreur ; un son manquant ne se cite pas", () => {
  const manquant = { code: "DEC_cercle", type: "decor", description: "un cercle de runes", raison: "absent" };
  const avec = {
    ...bonne,
    references: [...bonne.references, { asset: "DEC_cercle", nature: "image" as const, role: "Cercle", nom: "the rune circle", definition: "glowing on the floor" }],
    summary: "[[CHAR_maya]] walks through [[DEC_couloir]] and [[DEC_cercle]].",
    assetsManquants: [manquant],
  };
  assert.deepEqual(erreurs(avec), []);
  assert.ok(erreurs({ ...avec, assetsManquants: [] }).includes("asset-inconnu"), "sans déclaration, le code reste inventé");
  const son = { ...avec, references: [...bonne.references, { asset: "SFX_gong", nature: "son" as const, role: "Gong", nom: "a gong", definition: "ringing" }], assetsManquants: [{ ...manquant, code: "SFX_gong", type: "sfx" }], summary: "[[CHAR_maya]] [[DEC_couloir]] [[SFX_gong]]" };
  assert.ok(erreurs(son).includes("nature"));
});

test("raccord : trop d'images CITÉES dans les shots = erreur de renvoi ; des images déclarées mais non citées = info (le code les retire)", async () => {
  const { controlerSortiePlanH3: controler } = await import("./plan-h3-controles");
  const registre = Array.from({ length: 6 }, (_, i) => ({ code: `PROP_${i}`, type: "prop" }));
  const refs = registre.map((a) => ({ asset: a.code, nature: "image" as const, role: "r", nom: a.code, definition: "d" }));
  const cites = (n: number) => registre.slice(0, n).map((a) => `[[${a.code}]]`).join(" ");
  const sortie = (n: number) => ({
    titre: "t", dureeSecondes: 8, references: refs, summary: cites(6), ouverture: "style.", shots: [{ debutSecondes: 0, texte: `a wide shot of ${cites(n)}.` }],
    overall_soundscape: "wind.", non_diegetic_music: "N/A", assetsManquants: [], notes: "",
  });
  const sans = controler(sortie(6), { registre });
  assert.ok(!sans.some((p) => p.regle === "references-raccord"), "sans réserve : 6 images permises");
  const plein = controler(sortie(6), { registre, reserveRaccord: true });
  assert.ok(plein.some((p) => p.regle === "references-raccord" && p.niveau === "erreur" && /6 images sont citées/.test(p.message)));
  const cinq = controler(sortie(5), { registre, reserveRaccord: true });
  assert.ok(!cinq.some((p) => p.regle === "references-raccord" && p.niveau === "erreur"));
  assert.ok(cinq.some((p) => p.regle === "references-raccord" && p.niveau === "info"));
});

test("raccord : une matière faible (effet) citée dans un shot ne compte pas parmi les 5 images d'identité", async () => {
  const { controlerSortiePlanH3: controler } = await import("./plan-h3-controles");
  const registre = [...Array.from({ length: 5 }, (_, i) => ({ code: `CHAR_${i}`, type: "personnage" })), { code: "VFX_poussiere", type: "vfx" }];
  const refs = registre.map((a) => ({ asset: a.code, nature: "image" as const, role: "r", nom: a.code, definition: "d" }));
  const toutes = registre.map((a) => `[[${a.code}]]`).join(" ");
  const sortie = { titre: "t", dureeSecondes: 8, references: refs, summary: toutes, ouverture: "style.", shots: [{ debutSecondes: 0, texte: `a wide shot of ${toutes}.` }], overall_soundscape: "wind.", non_diegetic_music: "N/A", assetsManquants: [], notes: "" };
  assert.ok(!controler(sortie, { registre, reserveRaccord: true }).some((p) => p.niveau === "erreur" && p.regle === "references-raccord"));
});

test("action répétée : deux shots qui reprennent les mêmes verbes d'action = alerte (jamais une erreur) ; un rappel voulu ou un autre geste, non", async () => {
  const { controlerSortiePlanH3: controler } = await import("./plan-h3-controles");
  const avec = (textes: string[]): SortiePlanH3 => ({
    ...bonne,
    shots: textes.map((texte, i) => ({ debutSecondes: i * 3, texte })),
    dureeSecondes: 3 * textes.length + 2,
  });
  const repete = avec([
    "A wide shot of [[CHAR_maya]], her body tipping sideways as the dust wave keeps rolling across [[DEC_couloir]].",
    "a low-angle shot of [[CHAR_maya]], tipping further sideways while the dust keeps rolling over her boots.",
  ]);
  const p = controler(repete, ctx).filter((x) => x.regle === "action-repetee");
  assert.equal(p.length, 1);
  assert.equal(p[0]!.niveau, "alerte");
  assert.match(p[0]!.message, /tipping/);
  // un rappel annoncé comme tel (ralenti, rediffusion) n'est pas une répétition
  const rappel = avec([repete.shots[0]!.texte, "a close-up in slow motion of [[CHAR_maya]], tipping sideways, dust rolling past her cheek."]);
  assert.equal(controler(rappel, ctx).filter((x) => x.regle === "action-repetee").length, 0);
  // deux gestes différents : pas d'alerte
  const different = avec([repete.shots[0]!.texte, "a high-angle shot of [[CHAR_maya]], leaping over a fallen beam, landing hard on both feet."]);
  assert.equal(controler(different, ctx).filter((x) => x.regle === "action-repetee").length, 0);
  // les verbes de caméra ou d'état (following, standing…) ne comptent pas
  const camera = avec(["A shot following [[CHAR_maya]], standing near [[DEC_couloir]], the camera tracking left.", "a shot following [[CHAR_maya]], standing near the door, the camera tracking right."]);
  assert.equal(controler(camera, ctx).filter((x) => x.regle === "action-repetee").length, 0);
});
