/** Entrée LLM d'un tour de la conversation d'entrée. La FICHE DE NOTES (lib/agents/fiche.ts) est le support de la conversation :
 * l'agent la lit pour creuser ce qui manque ; le brief de l'utilisateur en sort, sans appel de rédaction. Pur (utilisé par le
 * service et par le worker). */

import { REQUIS, fichePourAgent, suppositions, type Fiche } from "./fiche";
import { SECTIONS_BRIEF } from "./types";

export type MessageLlm = { role: "user" | "assistant"; content: string };

/** Repères que les skills connaissent (voir leurs règles). */
export const MARQUE_FICHE = "[Fiche de notes";

/** Un modèle de chat veut une conversation qui COMMENCE par l'utilisateur ; or l'agent ouvre l'entretien (voir accroche.ts). */
export function messagesPourLlm(messages: MessageLlm[]): MessageLlm[] {
  return messages[0]?.role === "assistant" ? [{ role: "user", content: "Bonjour." }, ...messages] : messages;
}

/** Sérialisation compacte de la fiche (JSON sur une ligne : le modèle la relit, il ne la recopie pas mot pour mot). */
const brouillonEnTexte = (o: unknown): string => JSON.stringify(o);

/** Ce que le code dit à l'agent après avoir appliqué le dernier message à la fiche : ce qui reste à demander, ou « c'est complet ». */
export type RappelFiche = { manques: string[]; complete: boolean };

/** Messages d'un tour de `conversation-agent` : la conversation, avec, jointes au DERNIER message de l'utilisateur, les notes du
 * code (la fiche telle qu'elle est après ce message, ce qui reste à demander). La conversation stockée n'est jamais modifiée :
 * ce ne sont que des contextes de l'appel. Les manques sont un RAPPEL et non un questionnaire : l'agent mène librement. */
export function entreeTour(messages: MessageLlm[], fiche: Fiche, rappel: RappelFiche, format?: string): MessageLlm[] {
  const tous = messagesPourLlm(messages);
  const dernier = tous[tous.length - 1];
  if (!dernier || dernier.role !== "user") return tous;
  let contenu = `${dernier.content}\n\n${MARQUE_FICHE} (tenue par l'application d'après la conversation : ce que tu sais déjà)]\n${brouillonEnTexte(fichePourAgent(fiche))}`;
  const tranches = REQUIS.filter((r) => fiche.statuts[r.cle] === "fourni" || fiche.statuts[r.cle] === "delegue").map((r) => r.libelle.replace(/ \(.*\)$/, ""));
  const dejaDit = tranches.length ? ` Déjà tranché par l'utilisateur, à ne JAMAIS redemander : ${tranches.join(" ; ")}.` : "";
  const propose = suppositions(fiche)
    .filter((k) => ["style", "rythme", "genreTon", "dureeEpisodeSecondes", "langueDialogues"].includes(k))
    .map((k) => `${k === "style" ? "style visuel" : libelleSection(k)} : ${resume(fiche.contenu[k])}`);
  const dejaPropose = propose.length ? ` Déjà proposé dans la conversation et non contesté (ne le redemande pas : s'il y a lieu, fais-le confirmer d'un mot, en passant) : ${propose.join(" ; ")}.` : "";
  // Projet conçu avant l'entretien : le format (film ou série, épisodes prévus) n'est pas une section du brief, on le dit à part.
  const formatDit = format ? ` ${format}` : "";
  const interdit = "Ne dis jamais que le briefing est prêt ni que l'entretien est fini, et ne propose jamais de passer à la suite : l'application l'annonce elle-même.";
  if (rappel.complete) {
    const supposees = suppositions(fiche).map(libelleSection);
    contenu += `

[État de l'entretien : la fiche est complète et l'utilisateur continue à l'affiner.${supposees.length ? ` Ce qui reste supposé : ${supposees.join(", ")}.` : ""} Creuse un point mince ou supposé avec une question de fond, ou prends en compte ce qu'il vient de préciser.${formatDit} ${interdit}]`;
  } else {
    contenu += `

[État de l'entretien : l'utilisateur n'a pas encore dit : ${rappel.manques.join(" ; ")}. Ce n'est pas un programme : réagis d'abord à ce qu'il vient de dire, puis choisis dans cette liste, dans l'ordre que tu veux, l'angle qui se raccroche le mieux à son message (ou propose-lui toi-même si c'est ce qu'il demande ou s'il te laisse décider : alors ne repose pas la question). Une seule question de fond par message ; les points pratiques se regroupent.${dejaDit}${dejaPropose} Avant de questionner, relis la conversation : ce qu'il a déjà dit (même au passage, même dans un message plus haut) ou ce que tu as déjà demandé ne se redemande pas.${formatDit} ${interdit}]`;
  }
  return [...tous.slice(0, -1), { role: "user", content: contenu }];
}

const resume = (v: unknown): string => {
  const t = typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { nom?: unknown }).nom === "string" ? (v as { nom: string }).nom : JSON.stringify(v);
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
};

const libelleSection = (cle: string): string => (SECTIONS_BRIEF.find((x) => x.cle === cle)?.libelle ?? cle).replace(/ \(.*\)$/, "").toLowerCase();

/** Le message que le CODE poste quand la fiche devient complète : un résumé du briefing, ce qui a été supposé, et la main à
 * l'utilisateur (affiner, ou passer à l'étape suivante par le bouton). Il n'est jamais écrit par le modèle : seul le code sait que
 * la fiche est complète, et l'agent ne peut donc pas l'annoncer à tort. */
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
  const supposees = suppositions(fiche).map(libelleSection);
  if (supposees.length) l.push(`Ce que j'ai supposé, à garder ou à jeter : ${supposees.join(", ")}.`);
  l.push("Veux-tu encore affiner d'autres points ? Sinon, passe à l'étape suivante avec le bouton.");
  return l.join("\n\n");
}
