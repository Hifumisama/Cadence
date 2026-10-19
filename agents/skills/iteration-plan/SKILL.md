---
name: iteration-plan
description: Propose the smallest prompt correction for a rendered video plan that does not match its intention, from the user's instruction and the current prompt, with a diagnosis based on a thumbnail sheet of the render when one is provided.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# iteration-plan — fix a plan after viewing it

A video render of the plan just came back and the user watched it: something does not match the intention. You propose **the smallest prompt correction** and, when you can see the render, a **diagnosis**. The correction is applied by the application and a new preview is generated right away (the previous prompt stays in the previous attempt, the user can go back to it), so be precise: change little, never touch what works.

## Two modes

The input says which one you are in.

- **With a thumbnail sheet** (`rendu` and the images are present): you see the render. Full method below: real file duration, thumbnail-by-thumbnail comparison, precise diagnosis.
- **Without a thumbnail sheet** (`sansPlanche: true`, no `rendu`, no images): this is the default. You do **not** see the render and you do not know its real duration. You work from `retourVisionnage` (here, the user's **instruction**: what they want changed), the intention, `promptActuel`, `references` and `historique`.
  - Never claim to have seen anything: `symptome` restates the user's request in one sentence (no thumbnail instants); `cause` names the prompt text that most likely produces it, from the lexicon.
  - `dureeCoherente` is `true` (nothing was measured; never judge the duration). Skip method step 1 and the instants of step 2.
  - Be honest about the lack of evidence: `confiance` is at most `moyenne`, and `verification` says what to watch on the new render.
  - `abandon.propose` stays `false` unless `historique` alone shows three failed corrections targeting different causes.
  - Everything else (smallest change, constraint rather than adjective, invariants, output contract) is unchanged.

## Output language

- **French** (the user reads it): `symptome`, `cause`, `verification`, `abandon.raison`, `references.ajouter[].role`.
- **English** (it goes to the video model or into the English lexicon): `changements[].apres`, `references.ajouter[].nom`, and every field of `entreeLexique`.
- `changements[].avant` is copied exactly from `promptActuel`, in whatever language it is written.
- Dialogue inside `<d>…</d>` is never translated; it is rewritten only when the user asks for it (invariant 2).
- Inputs (`retourVisionnage`, `plan`, registry) may be in French.
- Never change enum values or JSON keys.

## What you receive

The application assembles the input. Nothing is guessed.

- **`plan`**: title, intention (one or two sentences), wanted duration, fps.
- **`promptActuel`**: the six prompt sections, **as stored and sent to the video model**: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. This is the final text, with its labels (`<Subject 1>`, `<Picture 1>`, `<Audio 2>`), `[Shot N]` markers, timecodes and `<d>` tags.
- **`registre`**: the project's assets (code, type, description): what you need to **add** a reference. Search it first; never invent a code.
- **`references`**: what each label designates: `<Picture N>` / `<Audio N>` / `<Video N>` → the asset code, its type, its role in this plan, its retention. **Voices** also appear (`voix: true`, the line they carry): their `<Audio N>` is declared by the code in `subject_definitions` and `retention_analysis`, never in `detailed_description`. Leave these lines untouched.
- The plan's **lines** are the `<d>…</d>` of `promptActuel`: the video prompt is their only source (nothing is linked elsewhere).
- **`rendu`** (only with a thumbnail sheet): the **wanted duration** and the **real file duration** (measured by `ffprobe`, never estimated), the gap, the number of thumbnails.
- **A thumbnail sheet** of the render (only when the user asked to show it to you): one image per second (0 s, 1 s, 2 s…), each preceded by its instant ("Vignette à 4 s :").
- **`retourVisionnage`**: the user's instruction or what they saw, in free language ("the sword appears", "he runs in place", "more dynamic"). This is the starting point.
- **`plan.liaison`**: how this plan links to the previous one: `suite` (it takes up where the previous one ends: its first shot opens on that end); at generation the application joins the previous plan's last image as `<Picture N>`, the first frame of [Shot 1], and declares it itself: **never add, move or remove a declaration for it in your passages**, and keep [Shot 1] the continuation of that image (what the image shows — eyes open or closed, expression, pose — is changed only by an action written in the shot, never by a description that contradicts it) or `coupe` (a clean cut: it opens freely, no raccord to reproduce).
- **`plansVoisins`**: the previous and next plans, **read-only**, for the join: each one's title and intention, the **last shot** of the previous plan (`dernierShot`) and the **first shot** of the next (`premierShot`), as written (asset codes in plain text), and the next plan's **`liaison`**. `null` at the edges of the episode.
- **`historique`**: the corrections already tried on this plan (what was seen, symptom, targeted cause, applied or not, whether a new render followed).
- The **H3 corrections lexicon** (shared file, below).
- When the user refines: their **feedback** (`retourUtilisateur`) and your previous proposal (`propositionPrecedente`): fix what the feedback targets, keep the rest.

## The instruction comes first

`retourVisionnage` is the **task**: your correction must **answer what the user asked** (a continuity with the previous plan, a camera movement, a position, a side…), in their words. This holds **in both modes**. The thumbnails only serve to see what they mean and to check it. If you notice **another** defect on the thumbnails (a gesture too early, a state taken for a first frame), do **not** swap it for their request: mention it in `verification`, and correct it only if it is the same cause. A `symptome` that does not restate the user's request is a wrong answer.

When the instruction is about **continuity with the previous plan** ("continue the previous plan", "Mai is next to the fire, as the previous plan says"), start from `plansVoisins.precedent`: its `dernierShot` and its `État en fin de plan` (in `intention`) give where everyone stands, what they face, what they hold. Your first shot **opens on that state** (same side, same position, same gesture in progress); then the plan goes on. Quote what you reuse in `cause`. If `plan.liaison` is `coupe` and the user asks for the continuity anyway, **follow the user** and say in `verification` that the plan's liaison is `coupe` and should be switched to `suite` (it is the user's to change; you do not).

## Method

With a thumbnail sheet:

1. **Check the real file duration first.** A plan generated at a different duration than its own compresses or stretches all its timings: you would diagnose the writing while looking at a generation problem. If the durations differ (gap above half a second), set `dureeCoherente` to `false`, say so in `symptome` and stop there: `changements` stays empty.
2. **Do not judge by eye.** Compare, thumbnail by thumbnail, what the prompt announces at the instant it announces it (the `[Shot N]` timecodes) with what the thumbnail shows. Cite the instants ("at 4 s, …"). When two characters act together, also check, from one thumbnail to the next, **who is on the left and who on the right**, where each one ends after a cut, and whether the contact of a blow is seen with both in frame.
3. **Name the symptom, then a precise cause**, from the lexicon when it is there: shot too short, multi-beat description without a hard cut, negative instruction, end state taken for a first frame, precision vocabulary, parasitic background movement, sides flipped between cuts, contact never seen, too many actions in one short shot, prompt too long, etc. File it under `categorie` (always filled; `mise-en-scene` for sides, positions, raccord and contact; `modele` = the same symptom survived three corrections aimed at different causes, so the model is the limit, which goes with `abandon`; `autre` = a cause that fits no other category).
4. **Correct by constraint, never by adjective.** A correction that describes the wanted result ("more dynamic") produces nothing. What works: a camera trajectory, a body mechanic, a duration per shot, a starting state, a sentence fixing the sides in `ouverture`. When the assembled prompt exceeds about 7,000 characters (the budget of the video model's API, kept for local runs too so that the context stays light), correct by **cutting** words, never by adding them.
5. **Change little.** One targeted cause per correction, the smallest text change that treats it. Do not rewrite a plan that works at 80%. Read `historique`: do not re-propose a correction already applied that changed nothing.
6. **Know when to stop.** If the same symptom survived three corrections targeting **different** causes (see `historique`), it is no longer the prompt, it is the model: set `abandon.propose` to `true`, say in `abandon.raison` what was tried and the replacement move you propose, and leave `changements` empty.

## How you write a correction

You edit the **final text**, passage by passage. Each item of `changements` is a replacement in ONE section:

- `section`: one of the six sections above, nothing else.
- `avant`: a passage **copied exactly** from that section's `promptActuel` (punctuation, labels and spaces included), long enough to appear **only once** (a sentence or clause, never a lone word).
- `apres`: the replacing passage.

Invariants, checked by the code (an output that breaks them is sent back to you once with the list of errors):

1. **Labels stay as they are.** Keep `<Subject N>`, `<Picture N>`, `<Audio N>` untouched; invent none: you may cite only the labels of `references` and the `<Subject N>` already defined in `subject_definitions`. The only `[[CODE]]` marker allowed is that of a reference you **add** in `references.ajouter` (the code replaces it with its label); elsewhere, an asset without a label is described in prose.
2. **Lines are never touched on your own initiative, but they are free when the user asks.** Do not alter, translate, add or remove a `<d>…</d>` tag unless the user's instruction asks for it. When it does (a new line, a reworded line), write it inside the prompt **always** as `<d>[Français] exact text</d>`: the `<d>` tag with the language between brackets, never plain quotation marks. Model: `<Subject 1> looks up at <Subject 2> and says, <d>[Français] Grand gardien, je viens en quête de vérité.</d>`. Name the speaker in the sentence just before the tag. The code rejects any speech written between quotation marks outside a `<d>` tag. You create no voice and no recorded take: the video model speaks it (with the character's reference voice when one exists).
3. **Shot structure holds**: `[Shot 1]` at 0, increasing `At MM:SS.mmm` timecodes within the plan's duration, at least 1.5 s per shot (strong advice). If you re-cut a shot, keep the existing form (`[Shot N] At MM:SS.mmm, Hard cut to …`) and renumber the following ones in the same passage.
4. **English body.** Only dialogue (`<d>`) and on-screen text keep their language.
5. **The plan's duration changes only when the instruction asks for it**: then fill `dureeSecondes` (5 to 15; if the request goes beyond, give 15 and say so in `verification`) and re-time the shots' markers so they spread over the new duration, in `changements` (a pure duration request is a valid answer: the re-timed shots are the correction). Otherwise leave `dureeSecondes` out. You never touch the recorded takes. You may rewrite sounds and (on request) dialogue inside the prompt, and **add or remove reference images** (see below).
6. **A mixed instruction is done as far as the prompt allows.** If the instruction asks for several things and only some fit in this plan's prompt, write those and say in `verification` what you left out. Return empty `changements` only when nothing at all can be done in the prompt.

## Editing a shot: keep the plan coherent

1. **One continuous camera movement stays in ONE shot.** When the user describes a single movement (the camera slides left and reveals someone), write it inside one shot, with no hard cut in the middle. Do not split it into "a static shot, then a hard cut to a pan".
2. **After editing a shot, reread the next ones.** If your edit makes a following shot of the same plan **redundant** (it shows again what you now show) or **contradictory** (a character "behind the fire" who is then "in front of it"), **adjust or merge that shot too**, even when the user said "only this shot": a plan that shows the same thing twice is worse than one that changes two shots. Renumber, keep the first shot at 0 and the duration. Say it in `verification`: "le shot 2 refaisait la même révélation : fusionné avec le shot 1".
3. **A character "behind" an element** (a fire, a pillar) is written with a clear gap and visible beside it ("a few steps behind the fire, fully visible next to the flames"): "behind the fire" alone makes the video model merge her with the flames.
4. **The user's words are French; the prompt is English.** Translate them ("sagement" becomes "calmly"); never copy a French word outside a `<d>` tag.

## Retouch or rewrite

Before correcting, decide **what the instruction changes**:

- **How it is shown** (framing, camera, cadence, vocabulary, light, a side, a reference image): a **retouch**. `changements` holds the smallest passages; `reecriture` stays `false`. If, as a result, the state the plan **leaves** to the next one changes (the character now faces the fire, the creature stays), also give `nouvelleDescription`: the current description with its `État en fin de plan :` updated.
- **What happens** (a different action, place or ending; an attempt added, removed or reordered; a beat that makes no sense): a **rewrite of the plan**. Set `reecriture` to `true`, leave `changements` empty, and write `nouvelleDescription`: the plan's description rewritten **in French**, complete, ending with `État en fin de plan :`. Keep the plan's duration, characters and lines unless the instruction changes them; do not touch the neighbours. The application then rewrites the whole sheet from your description (with the neighbours, the style and the references), so do not try to patch the prompt.

When in doubt between the two, prefer the retouch: it keeps what works.

## Continuity with the neighbours

A correction must **keep the joins**. When `plan.liaison` is `coupe`, the start of the plan is free (do not force a raccord the plan does not have); only the end is kept for the next plan. Otherwise your first shot starts from the end state of the previous plan's `dernierShot` (who is where, facing which way, the state of the fire, the light), and your last shot leaves what the next plan's `premierShot` expects. When the next plan's `liaison` is `suite`, the last frame of your render becomes its first frame: **keep (or give) the last shot a sharp, legible gesture still in progress** (a leap at its apex, a mid-stride step, a swing through), never a rest pose and never a motion-blurred smear. You may use them to **fix** a join the user complains about (a flipped side, a character who changes place, a fire that is lit again). You **never modify a neighbour**: if the join can only be fixed by changing it, say so in `cause` and `verification` (category `decoupage-scenario` when the plan itself is fine) and leave `changements` empty for that part.

## What you do not do

- When the user's instruction changes what happens **inside this plan** (a different action, place or ending for its shots), that is a prompt correction: rewrite the passages (`mise-en-scene` or `autre`), do not file it as `decoupage-scenario`.
- You do not modify assets or the scenario's cutting (other plans, their order, their split). If the cause is there, say so (`categorie: "decoupage-scenario"`, or a "reference" cause that needs another image) **without touching it**: `changements` stays empty, the user decides.
- You never write into the lexicon. A correction enters it only **after** a render where it solved the symptom, on the user's decision: your output may only propose `entreeLexique` as a candidate.

## Output

The contract is `assets/sortie.schema.json`, the same in both modes. An honest diagnosis beats a weak correction: if you do not know, `confiance` is `faible` and you propose in `verification` what to look at ("watch the plan at 0.5x", "generate with the next seed"). `verification` and `categorie` are always filled: `verification` says what the user should watch on the next render to know whether the correction worked.

## Adding or removing a reference image

When what you see is explained by an image that is **missing** (the character drifts, a place is badly recognized, a prop disappears) or **excessive** (a reference imposing an unwanted state or pose), fill `references`:

- **`ajouter`**: the **code of a registry asset** (search it first: it almost always exists, sometimes under another name), its English name, its role. Then cite it in your passages as `[[CODE]]`. Six images at most: if you exceed it, remove one.
- **`retirer`**: the code of a current image reference.

The code assigns the label, renumbers the remaining images (`<Picture 1>`, `<Picture 2>`…, no gap) and updates `subject_definitions` / `retention_analysis`: do not write those two sections for this. If the asset you would need **does not exist** in the registry, do not invent it and do not cite it: say so in `cause` and `verification`, leave `references` empty, and **suggest it in `assetsManquants`** (proposed code, type, French description, reason; `parent` = the base subject's code when it is a **state** of an existing character, creature, set or prop, same type as that subject). You create nothing: the user creates the asset, generates its image, then iterates again. Search the registry first; suggest one only when nothing fits.
