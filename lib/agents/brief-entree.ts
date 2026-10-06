/** Entrées LLM de la conversation d'entrée et de la rédaction du brief. Le brief, une fois une première version écrite, sert
 * de SUPPORT à l'itération : l'agent de conversation le lit pour creuser ce qui manque, et chaque réécriture du brief
 * part du brouillon courant plutôt que de zéro. Pur (utilisé par le service et par le worker). */

export type MessageLlm = { role: "user" | "assistant"; content: string };

/** Repère que les skills `conversation-agent` et `brief-projet` connaissent (voir leurs règles). */
export const MARQUE_BRIEF_COURANT = "[Briefing actuel";
export const MARQUE_COUVERTURE = "[Couverture de l'entretien";

const CONSIGNE_PREMIERE_VERSION =
  "Rédige maintenant le brief complet à partir de tout ce qui a été dit, sans poser de question : ce que je n'ai pas tranché est une invention (inventions) ou une question ouverte (questionsOuvertes). Remplis `statuts`.";

const CONSIGNE_MISE_A_JOUR =
  "Mets le briefing à jour à partir de tout ce qui a été dit, en partant du brouillon ci-dessous : garde ce qui est déjà tranché et que la conversation n'a pas remis en cause, corrige ce qui a changé, complète ce qui manquait, sans poser de question. Ce qui reste flou est une invention (inventions) ou une question ouverte (questionsOuvertes). Remplis `statuts`.";

/** Sérialisation compacte du brouillon (JSON sur une ligne : le modèle le relit, il ne le recopie pas mot pour mot). */
function brouillonEnTexte(brouillon: unknown): string {
  return JSON.stringify(brouillon);
}

/** Messages de l'appel `brief-projet` : la conversation, puis la consigne (et le brouillon courant s'il existe). */
export function entreeBrief(messages: MessageLlm[], brouillon: unknown | null): MessageLlm[] {
  return [
    ...messages,
    {
      role: "user",
      content: brouillon ? `${CONSIGNE_MISE_A_JOUR}\n\n${MARQUE_BRIEF_COURANT} (brouillon à mettre à jour)]\n${brouillonEnTexte(brouillon)}` : CONSIGNE_PREMIERE_VERSION,
    },
  ];
}

type BriefPourMessage = {
  titre?: string;
  arc?: string;
  dureeEpisodeSecondes?: number;
  rythme?: string;
  personnages?: { nom?: string }[];
  inventions?: string[];
};

/** Le message qui rend la main après l'écriture de la première version du briefing : ce que l'agent a compris et, surtout,
 * ce qu'il a INVENTÉ (c'est là que l'utilisateur corrige), puis ce qu'il lui reste à savoir. Écrit en code, sans appel LLM. */
export function messageBriefRedige(brief: BriefPourMessage, resteADefinir: string[]): string {
  const l: string[] = [];
  l.push(`J'ai rédigé une première version du briefing${brief.titre ? ` : « ${brief.titre} »` : ""}.`);
  if (brief.arc) l.push(`L'arc, tel que je l'ai compris : ${brief.arc.trim()}`);
  const noms = (brief.personnages ?? []).map((p) => p.nom).filter((n): n is string => !!n);
  if (noms.length) l.push(`Personnages : ${noms.join(", ")}.`);
  if (brief.dureeEpisodeSecondes) l.push(`Durée visée : ${brief.dureeEpisodeSecondes} s${brief.rythme ? `, rythme ${brief.rythme}` : ""}.`);
  const inventions = (brief.inventions ?? []).filter(Boolean).slice(0, 4);
  if (inventions.length) l.push(`Ce que j'ai inventé, à garder ou jeter : ${inventions.join(" ; ")}.`);
  l.push(
    resteADefinir.length
      ? `Je m'appuie dessus pour la suite : il me reste ${resteADefinir.length} point${resteADefinir.length > 1 ? "s" : ""} à creuser avec toi. Dis-moi d'abord ce qui sonne faux.`
      : "Dis-moi ce qui sonne faux, ou ce qui manque, avant que je le fige.",
  );
  return l.join("\n\n");
}

/** Messages d'un tour de `conversation-agent` : la conversation, avec le briefing courant (s'il existe) joint au DERNIER
 * message de l'utilisateur. La conversation stockée n'est jamais modifiée : le brief n'est qu'un contexte de l'appel. */
export function entreeTour(messages: MessageLlm[], brouillon: unknown | null, manques: string[] = []): MessageLlm[] {
  if ((!brouillon && manques.length === 0) || messages.length === 0) return messages;
  const dernier = messages[messages.length - 1]!;
  if (dernier.role !== "user") return messages;
  let contenu = dernier.content;
  // Ce que la grille de couverture du tour précédent a laissé « non dit » : le code le rappelle, c'est la prochaine question.
  if (manques.length) contenu += `\n\n${MARQUE_COUVERTURE} : l'utilisateur n'a pas encore DIT : ${manques.join(" ; ")}. Ne déclare pas le briefing prêt avant, et ta prochaine question en porte un.]`;
  if (brouillon) contenu += `\n\n${MARQUE_BRIEF_COURANT} (rédigé à partir de la conversation, à creuser et à faire évoluer)]\n${brouillonEnTexte(brouillon)}`;
  return [...messages.slice(0, -1), { role: "user", content: contenu }];
}
