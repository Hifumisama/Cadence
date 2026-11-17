import { recitDe } from "../clips/intent";

/** STILLNESS DETECTOR (project 259, 2026-11-17): a screenplay where half of the plans are a character standing still, posing, or an empty
 * set fading out gives long static close-ups and dead seconds on screen. The review skill only caught the duplicate. These rules are
 * deterministic, French-text heuristics tuned for PRECISION (better miss a static plan than nag about a dancing one):
 *
 * - A HOLDING marker says the body stays still for a while: a static adjective (immobile, figé·e, statique), "ne bouge plus / pas",
 *   "sans bouger", "reste/demeure debout/assise/plantée/là", "se tient en équilibre/debout/droite", "tient/garde la pose", "attend".
 * - BRIEF FREEZE: a marker in a sentence that says it is short ("un instant", "une seconde", "brièvement"…) is ignored, and the EVENT verbs
 *   ("se fige", "se figeant", "s'immobilise", "s'arrête") are never holding markers: stopping is a beat inside an action, not a still plan.
 * - A plan is STILL when holding markers appear in at least 2 narrative sentences, or in 1 sentence that is not the last one (a single marker
 *   in the last sentence is only a REST ENDING: it matters for a `suite` link, not for the whole plan).
 * - A plan is EMPTY when no character is present in its narrative (character names when known, otherwise a subject pronoun or a body
 *   part); a sentence that names a character only to say they are gone ("ayant disparu", "absente", "vide") does not count.
 * - DUPLICATE: two plans share a run of at least 8 identical words (case, accents and punctuation aside) in their narrative.
 * Pure, tested on the real 259 screenplay (lib/agents/fixtures/stillness-259.json). */

const L = "\\p{L}";
/** Word boundaries that work with accented letters (JS `\b` is ASCII only). */
const mot = (corps: string) => new RegExp(`(?<![${L}])(?:${corps})(?![${L}])`, "iu");

const MARQUEURS_TENUE: { nom: string; re: RegExp }[] = [
  { nom: "immobile", re: mot("immobiles?") },
  { nom: "figé", re: mot("fig(?:é|ée|és|ées)") },
  { nom: "statique", re: mot("statiques?") },
  { nom: "ne bouge plus", re: mot("ne\\s+bouge(?:nt)?\\s+(?:plus|pas)|sans\\s+(?:bouger|un\\s+geste)") },
  { nom: "reste sur place", re: mot("(?:reste|restent|demeure|demeurent)\\s+(?:debout|assise?s?|plant(?:é|ée|és|ées)|droite?s?|là|en\\s+place)") },
  { nom: "se tient", re: mot("se\\s+tien(?:t|nent)\\s+(?:en\\s+équilibre|debout|droite?s?|là|en\\s+place)") },
  { nom: "tient la pose", re: mot("(?:tient|tiennent|garde|gardent|conserve|conservent)\\s+(?:la|sa|leur|cette)\\s+(?:pose|position)") },
  { nom: "attend", re: new RegExp(`(?<![${L}'’])attend(?:ent)?(?![${L}])`, "iu") },
];
/** Event verbs and final poses: they only make a REST ENDING (the plan ends still), never a still plan by themselves. */
const MARQUEURS_FIN = mot("s['’]immobilis(?:e|ent)|se\\s+fig(?:e|ent)|s['’]arr[êe]t(?:e|ent)|(?:termine|terminent|finit|finissent|s['’]ach[èe]ve)\\s+(?:dans|sur|en)\\s+(?:une|sa|la)\\s+(?:position|pose)|(?:pose|position)\\s+finale");
/** A marker in such a sentence is a brief freeze inside an action, not a held stillness. */
const BREF = mot("un\\s+(?:bref\\s+)?instant|une\\s+(?:fraction\\s+de\\s+)?seconde|un\\s+court\\s+moment|brièvement|furtivement|à\\s+peine");
/** Meta sentences ("Ce plan établit…") comment the plan, they do not show anything. */
const PHRASE_META = /^(?:ce|cette|ces)\s+(?:plan|fin|scène|moment|séquence|instant|explosion|transformation)(?!\p{L})/iu;

/** The narrative sentences of a description: no author instruction, no lines of dialogue, no meta comment. */
export function phrasesDuRecit(description: string): string[] {
  return recitDe(description)
    .replace(/«[\s\S]*?»/g, " ")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s) && !PHRASE_META.test(s));
}

export type SigneImmobilite = { marqueur: string; phrase: string };

/** The holding markers of a description, sentence by sentence (one entry per sentence, its first marker), brief freezes excluded,
 * plus `finAuRepos` when the last narrative sentence leaves the character at rest (holding marker or event verb / final pose). */
export function signesImmobilite(description: string): { signes: SigneImmobilite[]; finAuRepos: string | null; nbPhrases: number } {
  const phrases = phrasesDuRecit(description);
  const signes: SigneImmobilite[] = [];
  for (const phrase of phrases) {
    if (BREF.test(phrase)) continue;
    const m = MARQUEURS_TENUE.find((x) => x.re.test(phrase));
    if (m) signes.push({ marqueur: m.nom, phrase });
  }
  const derniere = phrases.at(-1) ?? "";
  const finAuRepos = derniere && !BREF.test(derniere) && (MARQUEURS_TENUE.some((x) => x.re.test(derniere)) || MARQUEURS_FIN.test(derniere)) ? derniere : null;
  return { signes, finAuRepos, nbPhrases: phrases.length };
}

/** True when the description ends with the character at rest (see `signesImmobilite`). */
export const finitAuRepos = (description: string): boolean => signesImmobilite(description).finAuRepos != null;

/** True when the plan holds still: holding markers in 2 sentences or more, or in 1 sentence that is not the last one. */
export function planImmobile(description: string): boolean {
  const { signes, finAuRepos } = signesImmobilite(description);
  if (signes.length >= 2) return true;
  return signes.length === 1 && signes[0]!.phrase !== finAuRepos;
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** "La Danseuse" → "danseuse": the article is dropped, so "la danseuse" and "La Danseuse" both match. */
const nomCherche = (nom: string) => sansAccents(nom).replace(/^(?:la|le|les|l['’])\s*/, "").trim();
const ABSENCE = mot("disparu(?:e|s|es)?|absente?s?|vide|n['’]est\\s+plus\\s+là|sans\\s+personne");
const PRESENCE_GENERIQUE = mot("(?:il|elle|ils|elles)(?=\\s+(?!y\\s))|(?:son|le)\\s+corps|(?:ses|les)\\s+(?:bras|mains|jambes|pieds|doigts|yeux)|(?:sa|la)\\s+(?:main|tête)|son\\s+(?:visage|regard)");

/** True when no character acts in the plan (only light, set, ashes, flames…). With `nomsPersonnages`, a character is present when a sentence
 * names them (a sentence that names them only to say they are gone does not count); without names, a subject pronoun or a body part. */
export function planVide(description: string, nomsPersonnages: string[] = []): boolean {
  const phrases = phrasesDuRecit(description);
  if (phrases.length === 0) return false;
  // A character is named by their whole name or its first word (« Tifa » for « Tifa Lockhart », « soldat(s) » for « Soldat de Shinra »):
  // texts rarely repeat the full name (bench 2026-11-17: a whole fight read as empty). A subject pronoun or a body part counts too.
  const noms = [...new Set(nomsPersonnages.map(nomCherche).flatMap((n) => [n, n.split(/\s+/)[0] ?? ""]))].filter((n) => n.length >= 3);
  const present = (phrase: string) => {
    if (ABSENCE.test(phrase)) return false;
    const p = sansAccents(phrase);
    return PRESENCE_GENERIQUE.test(phrase) || noms.some((n) => mot(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?`).test(p));
  };
  return !phrases.some(present);
}

/** Minimum shared run, in words, for two plans to tell the same thing. 8 was too low on project 259: the recurring set-up
 * « La Danseuse est au centre de la Scène de Danse » (10 words) linked plans that have nothing else in common. */
export const NGRAMME_DOUBLON = 12;
/** A whole sentence repeated word for word is a duplicate from this length on (shorter ones are set-ups: « Elle se retourne. »). */
export const PHRASE_DOUBLON_MOTS = 6;
const motsDe = (texte: string) => sansAccents(texte).replace(/['’]/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Pairs of plans that share a whole sentence (at least `PHRASE_DOUBLON_MOTS` words) or a run of at least `NGRAMME_DOUBLON` identical words
 * (case, accents and punctuation aside), with the sentences of the first plan that carry it. */
export function phrasesPartagees(plans: { plan: string; description: string }[]): { a: string; b: string; phrases: string[] }[] {
  const ngrammes = (texte: string) => {
    const m = motsDe(texte);
    const s = new Set<string>();
    for (let i = 0; i + NGRAMME_DOUBLON <= m.length; i++) s.add(m.slice(i, i + NGRAMME_DOUBLON).join(" "));
    return s;
  };
  const parPlan = plans.map((p) => {
    const phrases = phrasesDuRecit(p.description);
    const entieres = new Set(phrases.map((ph) => motsDe(ph)).filter((m) => m.length >= PHRASE_DOUBLON_MOTS).map((m) => m.join(" ")));
    return { plan: p.plan, phrases, entieres, tous: ngrammes(phrases.join(" ")) };
  });
  const paires: { a: string; b: string; phrases: string[] }[] = [];
  for (let i = 0; i < parPlan.length; i++) {
    for (let j = i + 1; j < parPlan.length; j++) {
      const [a, b] = [parPlan[i]!, parPlan[j]!];
      const partagee = (ph: string) => b.entieres.has(motsDe(ph).join(" ")) || [...ngrammes(ph)].some((g) => b.tous.has(g));
      const communes = a.phrases.filter(partagee);
      // a run that spans two sentences is still a shared run
      if (communes.length === 0 && ![...a.tous].some((g) => b.tous.has(g))) continue;
      paires.push({ a: a.plan, b: b.plan, phrases: communes });
    }
  }
  return paires;
}

const extrait = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** The French findings, phrased as instructions the model can act on: still plans, empty plans, plans sharing sentences.
 * `plan` is the label used in the message (a handle "P05" for the review, « titre » for a scene). Pure. */
export function constatsImmobilite(plans: { plan: string; description: string }[], nomsPersonnages: string[] = []): { plan: string; message: string }[] {
  const constats: { plan: string; message: string }[] = [];
  for (const p of plans) {
    if (planVide(p.description, nomsPersonnages)) {
      constats.push({
        plan: p.plan,
        message: `${p.plan} : aucun personnage n'y agit, seuls la lumière, le décor ou des particules évoluent ; à l'écran ce sont des secondes vides. Coupe ce plan, fonds ce qu'il montre dans le plan voisin, ou fais-y agir un personnage.`,
      });
    } else if (planImmobile(p.description)) {
      const s = signesImmobilite(p.description).signes;
      constats.push({
        plan: p.plan,
        message: `${p.plan} : le personnage reste ${s[0]!.marqueur === "figé" ? "figé" : "immobile"} pendant le plan (« ${extrait(s[0]!.phrase)} »${s.length > 1 ? `, et ${s.length - 1} autre${s.length > 2 ? "s" : ""} phrase${s.length > 2 ? "s" : ""} du même ordre` : ""}) ; à l'écran c'est une image fixe. Donne-lui une action continue (un geste qui dure, un déplacement, une réaction du corps) ou fonds ce temps dans le plan voisin.`,
      });
    }
  }
  for (const d of phrasesPartagees(plans)) {
    constats.push({
      plan: d.b,
      message: `${d.a} et ${d.b} partagent des phrases entières (« ${extrait(d.phrases[0] ?? "")} ») : c'est le même temps raconté deux fois. Fusionne-les, ou écris dans ${d.b} ce qui change.`,
    });
  }
  return constats;
}

/** The character names of a skill input (`briefExtrait.personnages[].nom`), for `planVide`. Tolerant: an input without them gives []. */
export function nomsPersonnagesDeLEntree(entree: unknown): string[] {
  const perso = (entree as { briefExtrait?: { personnages?: { nom?: unknown }[] } | null } | null)?.briefExtrait?.personnages;
  return Array.isArray(perso) ? perso.map((p) => (typeof p?.nom === "string" ? p.nom.trim() : "")).filter(Boolean) : [];
}
