/** LLM input for one turn of the intake conversation. The NOTES SHEET (lib/agents/sheet.ts) is the conversation's medium:
 * the agent reads it to dig into what is missing; the user's brief comes out of it, without a writing call. Pure (used by the
 * service and by the worker). */

import { DEPENDANCES_CHANGEMENT, REQUIS, fichePourAgent, essentielsManquants, libelleDetail, momentsDeFiche, momentsRequis, momentsTranches, premierMessageGrosBloc, suppositions, valeurVide, type ChangementFiche, type Fiche } from "./sheet";
import { SECTIONS_BRIEF } from "./types";
import { synopsisDejaValide } from "./chat-synopsis";

export type MessageLlm = { role: "user" | "assistant"; content: string };

/** Markers the skills know (see their rules). */
export const MARQUE_FICHE = "[Fiche de notes";

/** A chat model wants a conversation that STARTS with the user; yet the agent opens the interview (see hook.ts). */
export function messagesPourLlm(messages: MessageLlm[]): MessageLlm[] {
  return messages[0]?.role === "assistant" ? [{ role: "user", content: "Bonjour." }, ...messages] : messages;
}

/** Compact serialization of the sheet (one-line JSON: the model re-reads it, it does not copy it word for word). */
const brouillonEnTexte = (o: unknown): string => JSON.stringify(o);

/** What the code tells the agent after applying the last message to the sheet: the essentials still to ask (`manques`), the
 * details to specify next (`details`, in order: costumes, sets, effects and props, continuity), or "it's complete". */
export type RappelFiche = { manques: string[]; details?: string[]; complete: boolean };

/** Messages of one `conversation-agent` turn: the conversation, with the code's notes attached to the LAST user message (the sheet
 * as it stands after this message, what is still to ask). The stored conversation is never modified:
 * these are only call contexts. The gaps are a REMINDER, not a questionnaire: the agent leads freely. */
export function entreeTour(messages: MessageLlm[], fiche: Fiche, rappel: RappelFiche, format?: string, changements: ChangementFiche[] = []): MessageLlm[] {
  const tous = messagesPourLlm(messages);
  const dernier = tous[tous.length - 1];
  if (!dernier || dernier.role !== "user") return tous;
  let contenu = `${dernier.content}\n\n${MARQUE_FICHE} (tenue par l'application d'après la conversation : ce que tu sais déjà)]\n${brouillonEnTexte(fichePourAgent(fiche))}`;
  if (changements.length) contenu += `\n\n${noteChangements(changements)}`;
  // The moments are settled only when there are enough of them: a validated but too short sequence is still to dig into.
  const tranches = REQUIS.filter((r) => (r.cle === "moments" ? momentsTranches(fiche) : fiche.statuts[r.cle] === "fourni" || fiche.statuts[r.cle] === "delegue")).map((r) => r.libelle.replace(/ \(.*\)$/, ""));
  const dejaDit = tranches.length ? ` Déjà tranché par l'utilisateur, à ne JAMAIS redemander : ${tranches.join(" ; ")}.` : "";
  const propose = suppositions(fiche)
    .filter((k) => ["style", "rythme", "genreTon", "dureeEpisodeSecondes", "langueDialogues"].includes(k))
    .map((k) => `${k === "style" ? "style visuel" : libelleSection(k)} : ${resume(fiche.contenu[k])}`);
  const dejaPropose = propose.length ? ` Déjà proposé dans la conversation et non contesté (ne le redemande pas : s'il y a lieu, fais-le confirmer d'un mot, en passant) : ${propose.join(" ; ")}.` : "";
  // Project designed before the interview: the format (a film) is not a brief section, so it is said separately.
  const formatDit = format ? ` ${format}` : "";
  const interdit = "Ne dis jamais que le briefing est prêt ni que l'entretien est fini, et ne propose jamais de passer à la suite : l'application l'annonce elle-même.";
  // A big first message (all in one block): we do not let it close the interview; we unfold it into several exchanges.
  const utilisateur = messages.filter((m) => m.role === "user").map((m) => m.content);
  const premierBloc =
    utilisateur.length === 1 && premierMessageGrosBloc(utilisateur)
      ? " Son premier message est un gros bloc : réagis à un détail, résume en UNE phrase ce qui est acquis, puis pose les questions d'UN seul sujet, regroupées dans le champ « questions »."
      : "";
  const details = rappel.details ?? [];
  // The film's moments (2026-11-17): when they are the next step of the order, the screenwriter proposes the missing sequence itself.
  const premier = rappel.manques[0] ?? "";
  const momentsEnTete = premier.startsWith(REQUIS.find((r) => r.cle === "moments")!.libelle);
  const vises = momentsRequis(fiche.contenu.dureeEpisodeSecondes);
  const notes = momentsDeFiche(fiche.contenu).length;
  const consigneMoments = momentsEnTete
    ? ` Les moments sont l'étape en cours (${notes} noté${notes > 1 ? "s" : ""}${vises ? ` ; la durée en appelle au moins ${vises}, un moment distinct toutes les dix secondes environ` : ""}). Avant de les proposer, assure-toi de savoir ce qui fait basculer l'histoire ; puis propose toi-même la suite complète dans le champ « sequence » (jamais en liste dans ta réponse), une phrase par moment (qui fait quoi, où, avec une action visible ; jamais une pose : une transformation arrive PENDANT que le personnage agit), en gardant à leur place ceux qu'il a déjà dits, et demande-lui de la valider ou de la changer. Jamais « statique », « immobile » ou « figé » comme qualité d'un personnage.`
    : "";
  // The synopsis comes first (test feedback 2026-11-23): nothing else is dug before the user has validated one.
  const synopsisAFaire = !rappel.complete && !synopsisDejaValide(utilisateur);
  if (synopsisAFaire) {
    contenu += `

[État de l'entretien : première étape, le synopsis, pas encore validé. Réagis d'abord à ce qu'il vient de dire. Si son idée donne déjà un héros et ce qu'il veut, propose le synopsis dans le champ « synopsis » : 3 à 5 phrases, où l'on est, qui est le héros, ce qu'il veut, ce qui l'en empêche, SANS la fin (elle viendra après les moments) ; tu complètes sobrement ce qu'il n'a pas dit, en le disant. Dans ta réponse, une phrase l'introduit et l'invite à le valider ou à le corriger (pas de question sur un autre sujet). Si son idée est encore trop mince pour ça, pose UNE question sur le cœur (qui, ce qu'il veut) et propose le synopsis au tour suivant. Ne passe ni au ton, ni au héros, ni aux moments tant qu'il n'est pas validé. S'il corrige, redonne le synopsis complet revu dans « synopsis ».${premierBloc}${formatDit} ${interdit}]`;
  } else if (rappel.complete) {
    const supposees = suppositions(fiche).map((k) => libelleSupposition(fiche, k));
    contenu += `

[État de l'entretien : la fiche est complète et l'utilisateur continue à l'affiner.${supposees.length ? ` Ce qui reste supposé : ${supposees.join(", ")}.` : ""} Creuse un point mince ou supposé avec une question de fond, ou prends en compte ce qu'il vient de préciser.${formatDit} ${interdit}]`;
  } else if (rappel.manques.length > 0) {
    contenu += `

[État de l'entretien : l'histoire se construit dans cet ordre, et voici ce qui reste : ${rappel.manques.join(" ; ")}. Réagis d'abord à ce qu'il vient de dire, puis avance sur le PREMIER point de cette liste, et seulement lui (s'il te le laisse, propose-le toi-même sans reposer la question). S'il vient de dire spontanément un point plus loin dans la liste, prends-le en compte sans le redemander, puis reviens au premier. Un seul sujet par message, ses questions (trois au plus) dans le champ « questions », avec des réponses rapides quand elles aident.${consigneMoments}${premierBloc}${dejaDit}${dejaPropose} Avant de questionner, relis la conversation : ce qu'il a déjà dit (même au passage, même dans un message plus haut) ou ce que tu as déjà demandé ne se redemande pas.${formatDit} ${interdit}]`;
  } else if (details.length > 0) {
    contenu += `

[État de l'entretien : l'essentiel est noté. Détails à préciser, dans cet ordre : ${details.join(" ; ")}. Réagis d'abord à ce qu'il vient de dire, puis pose UNE question ciblée sur le premier détail de la liste (des cartes \`choix\` sur des formes ou des palettes aident ici). S'il l'a déjà dit précisément, passe au suivant ; s'il te le laisse, propose-le en une phrase concrète (couleurs et matières nommées) sans reposer la question. Une référence (« inspiré de… ») ne suffit pas : demande ce qu'on en garde, en couleurs, formes et matières.${premierBloc}${dejaDit}${formatDit} ${interdit}]`;
  } else {
    contenu += `

[État de l'entretien : tout ce qui se demande est noté, mais l'entretien est encore jeune. Réagis à ce qu'il vient de dire et creuse un point mince ou supposé avec une question de fond (un moment clé, ce qu'on doit ressentir), une seule.${premierBloc}${dejaDit}${formatDit} ${interdit}]`;
  }
  return [...tous.slice(0, -1), { role: "user", content: contenu }];
}

const court = (t: string, n = 160) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** The note that makes the screenwriter SAY a change and ask which direction to keep, then name what follows from it. Pure. */
export function noteChangements(changements: ChangementFiche[]): string {
  const lignes = changements.map((c) => `${libelleSection(c.cle)} (avant : « ${court(c.avant)} » ; maintenant : « ${court(c.apres)} »)`);
  const dependantes = [...new Set(changements.flatMap((c) => DEPENDANCES_CHANGEMENT[c.cle] ?? []))].filter((k) => !changements.some((c) => c.cle === k));
  const libelles = dependantes.map((k) => libelleSection(k).toLowerCase());
  return `[Changement de direction : son dernier message modifie ce qui était tranché : ${lignes.join(" ; ")}. Une carte s'affiche sous ton message avec l'avant, l'après${libelles.length ? ` et ce que la nouvelle idée entraîne (${libelles.join(", ")})` : ""}, et deux boutons : garder l'ancienne version, prendre la nouvelle (un mélange, il l'écrit simplement dans sa réponse). Dis le changement en une ou deux phrases (« avant on avait…, tu proposes maintenant… »), dis ce que chaque version apporte, et invite-le à trancher avec la carte. Ne recopie pas la carte, ne pose aucune autre question dans ce tour et ne propose pas encore la version revue : une demande de changement n'est jamais une validation.]`;
}

const resume = (v: unknown): string => {
  const t = typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { nom?: unknown }).nom === "string" ? (v as { nom: string }).nom : JSON.stringify(v);
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
};

const libelleSection = (cle: string): string => (SECTIONS_BRIEF.find((x) => x.cle === cle)?.libelle ?? cle).replace(/ \(.*\)$/, "").toLowerCase();

/** The label of an assumption (`suppositions`): a section, or a detail ("la tenue de Lina"). */
const libelleSupposition = (fiche: Fiche, cle: string): string => libelleDetail(fiche, cle)?.replace(/ \(.*\)$/, "") ?? libelleSection(cle);

/** The message the CODE posts when the sheet becomes complete: a briefing summary, what was assumed, and the hand back to the
 * user (refine, or move to the next step with the button). It is never written by the model: only the code knows that
 * the sheet is complete, so the agent cannot announce it wrongly. */
export function messageBriefPret(fiche: Fiche): string {
  const c = fiche.contenu as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const l: string[] = ["Le briefing est prêt."];
  const titre = texte(c.titre);
  const arc = texte(c.arc);
  if (titre || arc) l.push(`${titre ? `« ${titre} » : ` : ""}${arc}`.trim());
  const style = (c.style as { nom?: unknown } | undefined)?.nom;
  const fiches: string[] = [];
  if (texte(c.genreTon)) fiches.push(`ton ${texte(c.genreTon).replace(/[.\s]+$/, "")}`);
  if (texte(style)) fiches.push(`style ${texte(style)}`);
  if (typeof c.dureeEpisodeSecondes === "number") fiches.push(`durée visée ${c.dureeEpisodeSecondes} s`);
  if (texte(c.rythme)) fiches.push(`rythme ${texte(c.rythme)}`);
  if (fiches.length) l.push(fiches.join(" · ") + ".");
  const noms = (Array.isArray(c.personnages) ? c.personnages : []).map((p) => texte((p as { nom?: unknown }).nom)).filter(Boolean);
  if (noms.length) l.push(`Personnages : ${noms.join(", ")}.`);
  const supposees = suppositions(fiche).map((k) => libelleSupposition(fiche, k));
  if (supposees.length) l.push(`Ce que j'ai proposé moi-même, à relire : ${supposees.join(", ")}.`);
  // After a stop asked by the user, an essential may still be empty (the notes did not fill it): it is said, the Brief corrects it.
  // Only what is EMPTY (an assumed value is already listed above; the ending is written in the story).
  const vides = essentielsManquants(fiche)
    .filter((r) => (r.cle === "moments" ? momentsDeFiche(fiche.contenu).length === 0 : r.cle !== "fin" && valeurVide(fiche.contenu[r.cle])))
    .map((r) => r.libelle.replace(/ \(.*\)$/, ""));
  if (vides.length) l.push(`Encore à compléter dans le Brief : ${vides.join(", ")}.`);
  l.push("Veux-tu encore affiner d'autres points ? Sinon, passe à l'étape suivante avec le bouton.");
  return l.join("\n\n");
}
