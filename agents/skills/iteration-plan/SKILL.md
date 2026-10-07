---
name: iteration-plan
description: Diagnose a rendered video plan that does not match its intention and propose the smallest prompt correction, as a proposal the user reviews before anything is written.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# iteration-plan — fix a plan after viewing it

A video render of the plan just came back and the user watched it: something does not match the intention. You make a **diagnosis** and propose **the smallest prompt correction**, as a proposal the user reviews before anything is written. You never fix blindly: you start from a real render, which you can see.

## Output language

- **French** (the user reads it): `symptome`, `cause`, `verification`, `abandon.raison`, `references.ajouter[].role`.
- **English** (it goes to the video model or into the English lexicon): `changements[].apres`, `references.ajouter[].nom`, and every field of `entreeLexique`.
- `changements[].avant` is copied exactly from `promptActuel`, in whatever language it is written.
- Dialogue inside `<d>…</d>` is never touched or translated.
- Inputs (`retourVisionnage`, `plan`, registry) may be in French.
- Never change enum values or JSON keys.

## What you receive

The application assembles the input. Nothing is guessed.

- **`plan`**: title, intention (one or two sentences), wanted duration, fps.
- **`promptActuel`**: the six prompt sections, **as stored and sent to the video model**: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. This is the final text, with its labels (`<Subject 1>`, `<Picture 1>`, `<Audio 2>`), `[Shot N]` markers, timecodes and `<d>` tags.
- **`registre`**: the project's assets (code, type, description): what you need to **add** a reference. Search it first; never invent a code.
- **`references`**: what each label designates: `<Picture N>` / `<Audio N>` / `<Video N>` → the asset code, its type, its role in this plan, its retention. **Voices** also appear (`voix: true`, the line they carry): their `<Audio N>` is derived from the line and is **never cited in the prompt** (this is normal, do not add it).
- **`repliques`**: the lines linked to the plan, exact text, measured take duration if it exists.
- **`rendu`**: the **wanted duration** and the **real file duration** (measured by `ffprobe`, never estimated), the gap, the number of thumbnails.
- **A thumbnail sheet** of the render: one image per second (0 s, 1 s, 2 s…), each preceded by its instant ("Vignette à 4 s :").
- **`retourVisionnage`**: what the user saw, in free language ("the sword appears", "he runs in place"). This is the starting point.
- **`historique`**: the corrections already tried on this plan (what was seen, symptom, targeted cause, applied or not, whether a new render followed).
- The **H3 corrections lexicon** (shared file, below).
- When the user refines: their **feedback** (`retourUtilisateur`) and your previous proposal (`propositionPrecedente`): fix what the feedback targets, keep the rest.

## Method

1. **Check the real file duration first.** A plan generated at a different duration than its own compresses or stretches all its timings: you would diagnose the writing while looking at a generation problem. If the durations differ (gap above half a second), set `dureeCoherente` to `false`, say so in `symptome` and stop there: `changements` stays empty.
2. **Do not judge by eye.** Compare, thumbnail by thumbnail, what the prompt announces at the instant it announces it (the `[Shot N]` timecodes) with what the thumbnail shows. Cite the instants ("at 4 s, …").
3. **Name the symptom, then a precise cause**, from the lexicon when it is there: shot too short, multi-beat description without a hard cut, negative instruction, end state taken for a first frame, precision vocabulary, parasitic background movement, etc. File it under `categorie`.
4. **Correct by constraint, never by adjective.** A correction that describes the wanted result ("more dynamic") produces nothing. What works: a camera trajectory, a body mechanic, a duration per shot, a starting state.
5. **Change little.** One targeted cause per correction, the smallest text change that treats it. Do not rewrite a plan that works at 80%. Read `historique`: do not re-propose a correction already applied that changed nothing.
6. **Know when to stop.** If the same symptom survived three corrections targeting **different** causes (see `historique`), it is no longer the prompt, it is the model: set `abandon.propose` to `true`, say in `abandon.raison` what was tried and the replacement move you propose, and leave `changements` empty.

## How you write a correction

You edit the **final text**, passage by passage. Each item of `changements` is a replacement in ONE section:

- `section`: one of the six sections above, nothing else.
- `avant`: a passage **copied exactly** from that section's `promptActuel` (punctuation, labels and spaces included), long enough to appear **only once** (a sentence or clause, never a lone word).
- `apres`: the replacing passage.

Invariants, checked by the code (an output that breaks them is sent back to you once with the list of errors):

1. **Labels stay as they are.** Keep `<Subject N>`, `<Picture N>`, `<Audio N>` untouched; invent none: you may cite only the labels of `references` and the `<Subject N>` already defined in `subject_definitions`. The only `[[CODE]]` marker allowed is that of a reference you **add** in `references.ajouter` (the code replaces it with its label); elsewhere, an asset without a label is described in prose.
2. **Lines stay verbatim.** Never touch the content of a `<d>…</d>` tag or its language; add none, remove none.
3. **Shot structure holds**: `[Shot 1]` at 0, increasing `At MM:SS.mmm` timecodes within the plan's duration, at least 1.5 s per shot (strong advice). If you re-cut a shot, keep the existing form (`[Shot N] At MM:SS.mmm, Hard cut to …`) and renumber the following ones in the same passage.
4. **English body.** Only dialogue (`<d>`) and on-screen text keep their language.
5. You change neither the plan's duration, nor its lines, nor its sounds. You may **add or remove reference images** (see below), nothing else.

## What you do not do

- You do not modify lines, assets or the scenario's cutting. If the cause is there, say so (`categorie: "decoupage-scenario"`, or a "reference" cause that needs another image) **without touching it**: `changements` stays empty, the user decides.
- You never write into the lexicon. A correction enters it only **after** a render where it solved the symptom, on the user's decision: your output may only propose `entreeLexique` as a candidate.

## Output

The contract is `assets/sortie.schema.json`. An honest diagnosis beats a weak correction: if you do not know, `confiance` is `faible` and you propose in `verification` what to look at ("watch the plan at 0.5x", "generate with the next seed"). `verification` always says what the user should watch on the next render to know whether the correction worked.

## Adding or removing a reference image

When what you see is explained by an image that is **missing** (the character drifts, a place is badly recognized, a prop disappears) or **excessive** (a reference imposing an unwanted state or pose), fill `references`:

- **`ajouter`**: the **code of a registry asset** (search it first: it almost always exists, sometimes under another name), its English name, its role. Then cite it in your passages as `[[CODE]]`. Six images at most: if you exceed it, remove one.
- **`retirer`**: the code of a current image reference.

The code assigns the label, renumbers the remaining images (`<Picture 1>`, `<Picture 2>`…, no gap) and updates `subject_definitions` / `retention_analysis`: do not write those two sections for this. If the asset you would need **does not exist** in the registry, do not invent it: say so in `cause` and `verification`, and leave `references` empty.
