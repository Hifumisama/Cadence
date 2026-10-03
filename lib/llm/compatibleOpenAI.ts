import { ErreurLlm, type DemandeLlm, type FournisseurLlm, type ReponseLlm } from "./types";

/** Fournisseur « compatible OpenAI » : un serveur qui parle `/v1/chat/completions`
 * (llama.cpp derrière llama-swap, Ollama, LM Studio, vLLM…). La sortie est
 * contrainte par `response_format` json_schema quand un schéma est fourni.
 *
 * Le flux (SSE) est le mode par défaut : une génération de plusieurs minutes ne
 * laisse pas la connexion muette (un reverse proxy la couperait) et donne la
 * progression en jetons. Annuler = couper la connexion : le serveur arrête. */

export type OptionsCompatibleOpenAI = {
  url: string;
  modele: string;
  delaiMs: number;
  /** Silence maximal toléré (aucun octet reçu, connexion ouverte) avant de couper ; 0 = pas de garde. `delaiMs`
   * reste le garde-fou sur la durée totale. Un serveur qui se tait sans fermer la connexion n'occupe plus le GPU
   * pendant tout `delaiMs`. */
  inactiviteMs?: number;
  flux: boolean;
  /** Champs ajoutés tels quels au corps de la requête (ex. chat_template_kwargs). */
  corpsSupplementaire?: Record<string, unknown>;
};

type Usage = { entree: number; sortie: number };

export class FournisseurCompatibleOpenAI implements FournisseurLlm {
  readonly nom = "compatible-openai";

  constructor(private readonly options: OptionsCompatibleOpenAI) {}

  async generer(d: DemandeLlm): Promise<ReponseLlm> {
    const modele = d.modele ?? this.options.modele;
    const debut = Date.now();
    const delai = AbortSignal.timeout(this.options.delaiMs);
    const inactiviteMs = this.options.inactiviteMs ?? 0;
    const silence = new AbortController();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const armer = () => {
      if (inactiviteMs <= 0) return;
      clearTimeout(minuterie);
      minuterie = setTimeout(() => silence.abort(), inactiviteMs);
    };
    const signal = AbortSignal.any([delai, silence.signal, ...(d.signal ? [d.signal] : [])]);
    const url = `${this.options.url}/v1/chat/completions`;

    const corps: Record<string, unknown> = {
      model: modele,
      messages: [{ role: "system", content: d.systeme }, ...d.messages],
      stream: this.options.flux,
      ...(this.options.flux ? { stream_options: { include_usage: true } } : {}),
      ...(d.maxTokens != null ? { max_tokens: d.maxTokens } : {}),
      ...(d.temperature != null ? { temperature: d.temperature } : {}),
      ...(d.schemaSortie
        ? { response_format: { type: "json_schema", json_schema: { name: "sortie", strict: true, schema: d.schemaSortie } } }
        : {}),
      ...this.options.corpsSupplementaire,
      ...d.corps,
    };

    try {
      armer();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: this.options.flux ? "text/event-stream" : "application/json" },
        body: JSON.stringify(corps),
        signal,
      });
      if (!res.ok) throw erreurHttp(res.status, await res.text().catch(() => ""), modele, contientImage(d));

      const type = res.headers.get("content-type") ?? "";
      const lu =
        this.options.flux && type.includes("text/event-stream") && res.body
          ? await lireFlux(res.body, d.surProgres, d.surFlux, armer)
          : lireJson(await res.json());

      return {
        texte: lu.texte,
        json: d.schemaSortie ? essayerJson(lu.texte) : undefined,
        usage: lu.usage,
        dureeMs: Date.now() - debut,
        modele: lu.modele ?? modele,
        arret: lu.arret,
        brut: lu.brut,
      };
    } catch (e) {
      throw traduire(e, d.signal, delai, url, this.options.delaiMs, silence.signal, inactiviteMs);
    } finally {
      clearTimeout(minuterie);
    }
  }
}

function essayerJson(texte: string): unknown {
  try {
    return JSON.parse(texte.trim());
  } catch {
    return undefined;
  }
}

type Lu = { texte: string; usage: Usage; modele?: string; arret?: string; brut: unknown };

function lireJson(j: any): Lu {
  const choix = j?.choices?.[0];
  return {
    texte: String(choix?.message?.content ?? ""),
    usage: { entree: Number(j?.usage?.prompt_tokens ?? 0), sortie: Number(j?.usage?.completion_tokens ?? 0) },
    modele: typeof j?.model === "string" ? j.model : undefined,
    arret: choix?.finish_reason ?? undefined,
    brut: j,
  };
}

/** Assemble un flux SSE OpenAI. Tolérant : une ligne illisible est ignorée. */
async function lireFlux(corps: ReadableStream<Uint8Array>, surProgres?: (n: number) => void, surFlux?: DemandeLlm["surFlux"], surOctets?: () => void): Promise<Lu> {
  surFlux?.({ type: "debut", texte: "" });
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";
  let texte = "";
  let morceaux = 0;
  let modele: string | undefined;
  let arret: string | undefined;
  let usage: Usage = { entree: 0, sortie: 0 };
  let dernier: unknown = null;
  let reflexion = 0;
  let fini = false;

  const traiter = (ligne: string) => {
    const l = ligne.trim();
    if (!l.startsWith("data:")) return;
    const charge = l.slice(5).trim();
    if (charge === "[DONE]") fini = true;
    if (!charge || charge === "[DONE]") return;
    let j: any;
    try {
      j = JSON.parse(charge);
    } catch {
      return;
    }
    dernier = j;
    if (typeof j?.model === "string") modele = j.model;
    const choix = j?.choices?.[0];
    const morceau = choix?.delta?.content;
    if (typeof morceau === "string" && morceau) {
      texte += morceau;
      surFlux?.({ type: "texte", texte: morceau });
      morceaux += 1;
      surProgres?.(morceaux);
    } else if (typeof choix?.delta?.reasoning_content === "string" && choix.delta.reasoning_content) {
      // Les modèles « qui réfléchissent » (Gemma 4, Qwen 3.6) émettent d'abord leur
      // raisonnement dans `reasoning_content` : il n'entre pas dans `texte`, mais il
      // consomme des jetons (et `max_tokens`) et compte pour la progression.
      reflexion += choix.delta.reasoning_content.length;
      surFlux?.({ type: "reflexion", texte: choix.delta.reasoning_content });
      morceaux += 1;
      surProgres?.(morceaux);
    }
    if (choix?.finish_reason) {
      arret = choix.finish_reason;
      fini = true;
    }
    if (j?.usage) usage = { entree: Number(j.usage.prompt_tokens ?? 0), sortie: Number(j.usage.completion_tokens ?? 0) };
  };

  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    surOctets?.();
    tampon +=decodeur.decode(value, { stream: true });
    let i: number;
    while ((i = tampon.indexOf("\n")) >= 0) {
      traiter(tampon.slice(0, i));
      tampon = tampon.slice(i + 1);
    }
  }
  traiter(tampon);
  // Un flux qui se ferme sans `finish_reason` ni `[DONE]` a été COUPÉ (serveur planté, reverse proxy,
  // swap de modèle) : son texte est un fragment, pas une sortie mal formée — on le dit franchement.
  if (!fini) {
    throw new ErreurLlm(
      "flux_coupe",
      `Flux interrompu par le serveur après ${texte.length} caractères de sortie et ${reflexion} de réflexion, sans fin de génération.`,
      { texte, reflexion },
    );
  }
  // Sans bloc d'usage (serveur qui n'envoie pas `include_usage`) : on retombe sur le
  // nombre de morceaux reçus, une approximation des jetons de sortie.
  if (usage.sortie === 0) usage = { ...usage, sortie: morceaux };
  return { texte, usage, modele, arret, brut: { assemble: true, caracteresReflexion: reflexion, dernierMorceau: dernier } };
}

function contientImage(d: DemandeLlm): boolean {
  return d.messages.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "image_url"));
}

function erreurHttp(statut: number, corps: string, modele: string, avecImages = false): ErreurLlm {
  const extrait = corps.slice(0, 500);
  // llama.cpp sans projecteur : « image input is not supported - hint: … provide the mmproj » ;
  // Ollama : « … does not support images ». On le nomme : ce n'est pas une panne du serveur.
  if (avecImages && /(image input is not supported|mmproj|does not support (images|vision)|multimodal)/i.test(extrait)) {
    return new ErreurLlm("vision_absente", `Le modèle « ${modele} » n'accepte pas les images sur ce serveur (projecteur mmproj absent ?) : ${extrait}`, { statut });
  }
  if ((statut === 404 || statut === 400) && /model/i.test(extrait) && /(not found|could not find|unknown|no such|does not exist|absent)/i.test(extrait)) {
    return new ErreurLlm("modele_absent", `Modèle « ${modele} » inconnu du serveur : ${extrait}`, { statut });
  }
  return new ErreurLlm("http", `Le serveur LLM a répondu ${statut} : ${extrait}`, { statut });
}

function traduire(
  e: unknown,
  signalUtilisateur: AbortSignal | undefined,
  delai: AbortSignal,
  url: string,
  delaiMs: number,
  silence?: AbortSignal,
  inactiviteMs = 0,
): ErreurLlm {
  if (e instanceof ErreurLlm) return e;
  if (signalUtilisateur?.aborted) return new ErreurLlm("interrompu", "Génération interrompue.");
  if (silence?.aborted) {
    return new ErreurLlm("delai", `Le serveur LLM n'a rien envoyé depuis ${Math.round(inactiviteMs / 1000)} s (${url}) : connexion coupée.`);
  }
  if (delai.aborted) return new ErreurLlm("delai", `Délai dépassé (${Math.round(delaiMs / 1000)} s) sans réponse complète.`);
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  const detail = cause?.code ?? cause?.message ?? (e as Error)?.message ?? "inconnu";
  return new ErreurLlm("injoignable", `Serveur LLM injoignable (${url}) : ${detail}`, e);
}
