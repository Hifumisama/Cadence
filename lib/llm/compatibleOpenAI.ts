import { ErreurLlm, type DemandeLlm, type FournisseurLlm, type ReponseLlm, type TimingsServeur } from "./types";

/** « OpenAI-compatible » provider: a server that speaks `/v1/chat/completions`
 * (llama.cpp behind llama-swap, Ollama, LM Studio, vLLM…). The output is
 * constrained by `response_format` json_schema when a schema is provided.
 *
 * The stream (SSE) is the default mode: a generation lasting several minutes does not
 * leave the connection silent (a reverse proxy would cut it) and gives progress
 * in tokens. Cancelling = cutting the connection: the server stops. */

export type OptionsCompatibleOpenAI = {
  url: string;
  modele: string;
  delaiMs: number;
  /** Maximum silence tolerated (no byte received, connection open) before cutting; 0 = no guard. `delaiMs`
   * remains the guard on the total duration. A server that goes silent without closing the connection no longer occupies the GPU
   * for the whole `delaiMs`. */
  inactiviteMs?: number;
  flux: boolean;
  /** Fields added as-is to the request body (e.g. chat_template_kwargs). */
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
        reflexion: lu.reflexion,
        json: d.schemaSortie ? essayerJson(lu.texte) : undefined,
        usage: lu.usage,
        dureeMs: Date.now() - debut,
        modele: lu.modele ?? modele,
        arret: lu.arret,
        brut: lu.brut,
        timings: lu.timings,
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

/** Bound of the reasoning kept for the trace (characters): a verbose model can produce hundreds of thousands. */
const REFLEXION_MAX_CARACTERES = 100_000;

type Lu = { texte: string; reflexion?: string; usage: Usage; modele?: string; arret?: string; brut: unknown; timings?: TimingsServeur };

/** The `timings` block of llama-server (absent from other servers); null if it is missing or does not have the expected shape. */
function lireTimings(t: any): TimingsServeur | undefined {
  if (!t || typeof t !== "object") return undefined;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { cacheN: n(t.cache_n), promptN: n(t.prompt_n), promptMs: n(t.prompt_ms), predictedN: n(t.predicted_n), predictedMs: n(t.predicted_ms), draftN: n(t.draft_n), draftAcceptedN: n(t.draft_n_accepted) };
}

function lireJson(j: any): Lu {
  const choix = j?.choices?.[0];
  return {
    texte: String(choix?.message?.content ?? ""),
    reflexion: typeof choix?.message?.reasoning_content === "string" && choix.message.reasoning_content ? choix.message.reasoning_content.slice(0, REFLEXION_MAX_CARACTERES) : undefined,
    usage: { entree: Number(j?.usage?.prompt_tokens ?? 0), sortie: Number(j?.usage?.completion_tokens ?? 0) },
    modele: typeof j?.model === "string" ? j.model : undefined,
    arret: choix?.finish_reason ?? undefined,
    brut: j,
    timings: lireTimings(j?.timings),
  };
}

/** Assembles an OpenAI SSE stream. Tolerant: an unreadable line is ignored. */
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
  let timings: TimingsServeur | undefined;
  let reflexion = 0;
  let reflexionTexte = "";
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
    if (j?.timings) timings = lireTimings(j.timings) ?? timings;
    if (typeof j?.model === "string") modele = j.model;
    const choix = j?.choices?.[0];
    const morceau = choix?.delta?.content;
    if (typeof morceau === "string" && morceau) {
      texte += morceau;
      surFlux?.({ type: "texte", texte: morceau });
      morceaux += 1;
      surProgres?.(morceaux);
    } else if (typeof choix?.delta?.reasoning_content === "string" && choix.delta.reasoning_content) {
      // Models that « think » (Gemma 4, Qwen 3.6) first emit their reasoning in
      // `reasoning_content`: it does not go into `texte`, but it consumes tokens
      // (and `max_tokens`) and counts towards progress.
      reflexion += choix.delta.reasoning_content.length;
      if (reflexionTexte.length < REFLEXION_MAX_CARACTERES) reflexionTexte += choix.delta.reasoning_content;
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
  // A stream that closes without `finish_reason` or `[DONE]` was CUT (server crashed, reverse proxy,
  // model swap): its text is a fragment, not a malformed output — we say so frankly.
  if (!fini) {
    throw new ErreurLlm(
      "flux_coupe",
      `Flux interrompu par le serveur après ${texte.length} caractères de sortie et ${reflexion} de réflexion, sans fin de génération.`,
      { texte, reflexion },
    );
  }
  // Without a usage block (server that does not send `include_usage`): we fall back on the
  // number of chunks received, an approximation of the output tokens.
  if (usage.sortie === 0) usage = { ...usage, sortie: morceaux };
  return { texte, reflexion: reflexionTexte ? reflexionTexte.slice(0, REFLEXION_MAX_CARACTERES) : undefined, usage, modele, arret, timings, brut: { assemble: true, caracteresReflexion: reflexion, dernierMorceau: dernier } };
}

function contientImage(d: DemandeLlm): boolean {
  return d.messages.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "image_url"));
}

function erreurHttp(statut: number, corps: string, modele: string, avecImages = false): ErreurLlm {
  const extrait = corps.slice(0, 500);
  // llama.cpp without a projector: « image input is not supported - hint: … provide the mmproj » ;
  // Ollama: « … does not support images ». We name it: this is not a server failure.
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
