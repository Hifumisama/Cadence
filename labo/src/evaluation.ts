/** An outside reader (another assistant) judges the texts of one scene, blind: one self-contained Markdown file to send, and its answer read
 * back. It informs and never votes. The code checks that every quote exists; nothing here judges a text. */

import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LIGHT_EXPERIMENT } from "./campaign";
import type { DuelKey, DuelVotes } from "./duel";
import { readDataset } from "./files";
import { firstAnswer, versionsOf } from "./light";
import { sceneBrief, shuffle, type SceneBrief, type ShownPlans } from "./reading";
import { table, yes } from "./score";

const DEFECT_TYPES = ["invention", "omission", "répétition", "commentaire au lieu du récit", "caméra ou lumière", "contradiction", "langue", "autre"];

export type EvaluationKey = {
  evaluationId: string;
  /** Letter shown to the reader → version. */
  texts: Record<string, string>;
  /** Run folders whose duels the answer is compared with. */
  runs: string[];
};

export type EvaluationAnswer = {
  evaluationId: string;
  /** From best to worst; letters of the same group are worth the same. */
  ranking: string[][];
  texts: Record<string, { betrays: boolean; strength?: string; defects: { type: string; quote: string; why?: string }[] }>;
  comment?: string;
};

type Text = { version: string; plans: ShownPlans };

const body = (plans: ShownPlans) => plans.map((p, i) => `**Plan ${i + 1} · ${p.title}**\n\n${p.description}`).join("\n\n");

export function buildEvaluation(brief: SceneBrief, texts: Text[], runs: string[], random: (max: number) => number = randomInt, evaluationId: string = randomBytes(6).toString("hex")): { markdown: string; key: EvaluationKey } {
  const drawn = shuffle(texts, random).map((text, i) => ({ ...text, letter: String.fromCharCode(65 + i) }));
  const letters = drawn.map((t) => t.letter);
  const list = (title: string, items: string[]) => (items.length ? `\n${title}\n\n${items.map((x) => `- ${x}`).join("\n")}\n` : "");
  const example = { evaluationId, ranking: [[letters[0]], letters.slice(1)], texts: { [letters[0]!]: { betrays: false, strength: "…", defects: [{ type: DEFECT_TYPES[0], quote: "…", why: "…" }] } }, comment: "…" };
  const markdown = `# Évaluation à l'aveugle d'un découpage de scène

## Ton rôle

Tu es un lecteur indépendant. Voici ${drawn.length} versions anonymes (${letters.join(", ")}) du découpage en plans d'une même scène, destiné à
la génération vidéo. Tu ne sais pas comment elles ont été produites : n'essaie pas de le deviner.

## Comment juger

- **Progression** : chaque plan apporte-t-il quelque chose à la scène ?
- **Fidélité** : les moments et les intentions demandés sont-ils là, sans remplissage ni événement ajouté ?
- **Cohérence** : les plans s'enchaînent-ils sans se contredire ?
- **Écriture** : le texte est-il clair, précis, vivant ?

Règles : ne récompense ni la longueur ni le nombre de plans en soi ; juge ce qui est écrit, pas ce que le texte annonce
vouloir faire ; des versions qui se valent vont dans le même groupe du classement ; ne mets pas de défauts pour faire
nombre.

## La scène demandée : ${brief.title}

${brief.intention}
${list("Moments, dans l'ordre :", brief.moments)}${brief.authorMoments ? `\nCe que l'auteur en a dit : ${brief.authorMoments}\n` : ""}${brief.entry ? `\nDépart : ${brief.entry}\n` : ""}${brief.exit ? `\nArrivée : ${brief.exit}\n` : ""}${list("Paroles de l'auteur sur le projet :", brief.authorWords)}
## Les textes

${drawn.map((t) => `### Texte ${t.letter}\n\n${body(t.plans)}`).join("\n\n---\n\n")}

## Ta réponse

Réponds par **un seul bloc JSON**, sans texte autour, avec les ${drawn.length} textes :

- \`ranking\` : les lettres de la meilleure à la moins bonne, par groupes ;
- pour chaque texte : \`betrays\` (trahit-il gravement la scène demandée ?), \`strength\` (sa principale qualité, une phrase),
  \`defects\` (5 au plus) avec \`type\` parmi ${DEFECT_TYPES.map((d) => `« ${d} »`).join(", ")}, \`quote\` (citation **mot pour mot** du texte,
  courte) et \`why\` (une phrase) ;
- \`comment\` : ton avis d'ensemble, 3 phrases au plus.

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`
`;
  return { markdown, key: { evaluationId, texts: Object.fromEntries(drawn.map((t) => [t.letter, t.version])), runs } };
}

/** The answer as pasted: the JSON may come inside a code block, with words around. */
export function parseAnswer(raw: string, key: EvaluationKey): EvaluationAnswer {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  let answer: EvaluationAnswer;
  try {
    answer = JSON.parse(json) as EvaluationAnswer;
  } catch {
    throw new Error("Réponse illisible : pas de bloc JSON valide.");
  }
  if (answer.evaluationId !== key.evaluationId) throw new Error("Cette réponse ne porte pas sur ce fichier d'évaluation.");
  const letters = Object.keys(key.texts);
  const ranked = (answer.ranking ?? []).flat();
  if (ranked.length !== letters.length || !letters.every((l) => ranked.includes(l))) throw new Error(`Classement incomplet : chaque texte (${letters.join(", ")}) doit y figurer une fois.`);
  const missing = letters.filter((l) => !Array.isArray(answer.texts?.[l]?.defects));
  if (missing.length) throw new Error(`Avis manquant : ${missing.join(", ")}.`);
  return answer;
}

/** Spaces, apostrophes and case do not make a quote wrong. */
const plain = (text: string) => text.replace(/[’‘]/g, "'").replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export const quoteFound = (quote: string, plans: ShownPlans): boolean => plain(quote) !== "" && plain(plans.map((p) => `${p.title} ${p.description}`).join(" ")).includes(plain(quote).replace(/^[«" ]+|[»" .…]+$/g, ""));

type AuthorDuel = { sides: [string, string]; winner: string | null };

export function evaluationReport(key: EvaluationKey, answer: EvaluationAnswer, texts: Text[], duels: AuthorDuel[]): string {
  const rank = new Map(answer.ranking.flatMap((group, i) => group.map((letter) => [key.texts[letter]!, i + 1] as const)));
  const preferred = ([a, b]: [string, string]) => (rank.get(a) === rank.get(b) ? "égalité" : rank.get(a)! < rank.get(b)! ? a : b);
  const entries = Object.entries(key.texts).sort(([, a], [, b]) => a.localeCompare(b));
  const defects = entries.flatMap(([letter, version]) =>
    answer.texts[letter]!.defects.map((d) => [version, d.type, `« ${d.quote.replace(/\|/g, "/").replace(/\s+/g, " ")} »`, yes(quoteFound(d.quote, texts.find((t) => t.version === version)!.plans)), (d.why ?? "").replace(/\|/g, "/").replace(/\s+/g, " ")]),
  );
  return `# Lecteur extérieur, évaluation ${key.evaluationId}

Informatif : il ne vote pas, et aucune moyenne n'est faite avec l'auteur.

${table(
    ["Version", "Rang", "Trahit la scène", "Qualité relevée"],
    entries.map(([letter, version]) => [`${version} (${LIGHT_EXPERIMENT.labels[version] ?? "?"})`, rank.get(version)!, answer.texts[letter]!.betrays ? "**oui**" : "non", (answer.texts[letter]!.strength ?? "–").replace(/\|/g, "/").replace(/\s+/g, " ")]),
  )}

## Face aux duels de l'auteur

${duels.length ? table(["Duel", "Auteur", "Lecteur extérieur"], duels.map((d) => [[...d.sides].sort().join(" contre "), d.winner ?? "pas encore répondu", preferred(d.sides)])) : "Aucun duel."}

## Défauts relevés

${defects.length ? table(["Version", "Type", "Citation", "Trouvée", "Pourquoi"], defects) : "Aucun."}
${answer.comment ? `\n## Avis d'ensemble\n\n${answer.comment.trim()}\n` : ""}`;
}

/** The first answers of the runs given, one per version. */
function textsOf(runs: string[]): { brief: SceneBrief; texts: Text[] } {
  const found = new Map<string, Text>();
  let brief: SceneBrief | undefined;
  for (const run of runs) {
    const { manifest, versions } = versionsOf(run);
    brief ??= sceneBrief(readDataset(manifest.dataset).cases.find((c) => c.id === manifest.cases[0])!);
    for (const { id, record } of versions) {
      const answer = firstAnswer(record);
      if (answer) found.set(id, { version: id, plans: answer.plans.map((p) => ({ title: p.titre, description: p.description })) });
    }
  }
  return { brief: brief!, texts: [...found.values()] };
}

/** Writes the file to send in the last run's folder, once. */
export function writeEvaluation(runs: string[]): string {
  const folders = runs.map((r) => resolve(r));
  const target = join(folders.at(-1)!, "evaluation");
  const file = join(target, "evaluation.md");
  if (existsSync(join(target, "key.json"))) return file;
  const { brief, texts } = textsOf(folders);
  const { markdown, key } = buildEvaluation(brief, texts, folders);
  mkdirSync(target, { recursive: true });
  writeFileSync(file, markdown);
  writeFileSync(join(target, "key.json"), `${JSON.stringify(key, null, 2)}\n`);
  return file;
}

export function readEvaluationAnswer(run: string, answerFile: string): string {
  const key = JSON.parse(readFileSync(join(resolve(run), "evaluation", "key.json"), "utf8")) as EvaluationKey;
  const answer = parseAnswer(readFileSync(resolve(answerFile), "utf8"), key);
  const duels = key.runs.flatMap((folder) => {
    const read = <T>(name: string): T | null => (existsSync(join(folder, "duels", name)) ? (JSON.parse(readFileSync(join(folder, "duels", name), "utf8")) as T) : null);
    const duelKey = read<DuelKey>("key.json");
    const votes = read<DuelVotes>("votes.json");
    return Object.entries(duelKey?.duels ?? {}).map(([id, duel]): AuthorDuel => {
      const choice = votes?.duels[id]?.choice;
      const labels: Record<string, string> = { equal: "égalité", none: "aucun", skip: "passé" };
      return { sides: duel.sides, winner: choice === "1" || choice === "2" ? duel.sides[Number(choice) - 1]! : choice ? labels[choice]! : null };
    });
  });
  return evaluationReport(key, answer, textsOf(key.runs).texts, duels);
}
