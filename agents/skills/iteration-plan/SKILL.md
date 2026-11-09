---
name: iteration-plan
description: Analyse the user's instruction on a rendered video plan, diagnose the cause, and decide the smallest change to the plan's sources of truth (intent, duration, reference images, creativity and staging style); the video prompt is then recompiled from them by the application.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# iteration-plan — decide what changes after viewing a plan

A video render of the plan came back and the user watched it: something does not match the intention. You **diagnose** the cause and **decide** what changes on the plan. You do **not** write the video prompt: the application recompiles it (Open H3 IR) from what you decide, every time, and writes your decisions together with the new prompt. The previous attempt stays available to the user.

The plan has only these sources of truth, and your decisions change only them:

1. **the intent** (`plan.intention`: what happens, in order, then the lines) → `decisions.nouvelleDescription`;
2. **the duration** (`plan.dureeVoulueSecondes`, 4 to 10 s) → `decisions.dureeSecondes`;
3. **the reference images** (`references`, chosen from `registre`) → `decisions.references`;
4. **two settings**: creativity and staging style (`reglages`) → `decisions.reglages`.

There is no free-text directive that persists. A new value **replaces** the current one: it never adds to it.

## Two modes

The input says which one you are in.

- **With a thumbnail sheet** (`rendu` and the images are present): you see the render. Check the real file duration first: if it differs from the wanted one (gap above half a second), set `dureeCoherente` to `false`, say so in `symptome`, and decide nothing (all decisions empty). Then compare, thumbnail by thumbnail, what the plan should show with what the thumbnail shows; cite the instants ("à 4 s, …"); check who is left and right after each cut.
- **Without a thumbnail sheet** (`sansPlanche: true`, the default): you do **not** see the render. `symptome` restates the user's request in one sentence (no instants); `cause` names what most likely produces it, from the lexicon; `dureeCoherente` is `true`; `confiance` is at most `moyenne`; `verification` says what to watch on the next render.

## The instruction comes first

`retourVisionnage` is the **task**: your decisions must answer what the user asked, in both modes. The thumbnails only show what they mean. If you notice another defect, mention it in `verification`; treat it only if it is the same cause. A `symptome` that does not restate the request is a wrong answer.

When the instruction is about continuity with the previous plan, start from `plansVoisins.precedent` (its `dernierShot` and the end of its intention): the intent opens on that state (same side, same position, same gesture). If `plan.liaison` is `coupe` and the user asks for continuity anyway, follow the user and say in `verification` that the liaison should be switched to `suite` (the user's to change).

## Choose the smallest lever

Pick **one cause**, then the **smallest lever that treats it**, in this order:

1. **A setting** (`reglages`) — camera energy, rhythm, framing taste, light mood:
   - `creativite`: `restrained` (adds nothing: no music, no extra lines, held camera) < `balanced` (default) < `bold` (more camera, may add lines or on-screen text) < `extreme` (everything pushed: wide fast camera, hard contrasts).
   - `styleMiseEnScene`: one of `reglages.choix.styleMiseEnScene` (each has its effect written next to it), or `aucun` for no style.
   - Camera and rhythm requests ("plus de mouvement", "caméra plus posée", "plus nerveux", "plus contemplatif") are answered **here**, never by a camera sentence in the intent.
   - Give a value only when it differs from the current one (`reglages.creativite.actuelle`, `reglages.styleMiseEnScene.actuel`); otherwise `null`.
2. **References** (`references`) — a character drifts, a place is not recognized, a prop disappears (an image is missing), or a state/pose is imposed (an image is excessive):
   - `ajouter`: registry codes only (search `registre`: it almost always exists, sometimes under another name), image assets only, six images at most in total. An asset with `image: false` has no image yet: the recompilation will wait for it; say so in `verification`.
   - `retirer`: codes of the current image references. At least one image must remain.
3. **Duration** (`dureeSecondes`) — only when the instruction asks for it, or when the plan is too short for what it must hold. 4 to 10; if the request goes beyond 10, give 10 and say so in `verification`.
4. **The intent** (`nouvelleDescription`) — when what happens must change (an action, a position, a side, an ending, a line on the user's request), or when the correction has no other lever.

Several levers together are allowed when the instruction asks several things; each still the smallest. If nothing at all can be done in this plan, leave every decision empty and explain in `cause` and `verification`.

## Writing the intent

`nouvelleDescription` **replaces** the plan's intent entirely. Leave it as an empty string when the intent does not change. When it changes:

1. Start from `plan.intention`, copied **word for word**, and change only what the instruction needs. Keep every other sentence, every line `NAME : « text »` (unless the instruction changes it) and the `Consigne de l'auteur :` sentence if there is one.
2. Form: the narrative in order (where everyone starts, relative to fixed landmarks of the place; the gestures; what changes; how the plan ends), then the lines, one per line, in French.
3. No camera, lens or framing words: those belong to the settings.
4. A character "behind" an element (a fire, a pillar) is written with a clear gap ("a few steps behind the fire, fully visible next to the flames").
5. Say what is wanted, never what is forbidden ("her hands rest on the strap", not "no sword").
6. Never a line `État en fin de plan :`.
7. Never return a fragment (only the changed sentence): the code refuses it and sends it back.

## Continuity with the neighbours

Keep the joins. When `plan.liaison` is `suite`, the plan opens where the previous one ends; when it is `coupe`, the start is free. When the next plan's `liaison` is `suite`, the end of this plan becomes its first frame: keep the last beat a sharp gesture still in progress, never a rest pose. You never modify a neighbour: if the join can only be fixed there, say so in `cause` and `verification` (`decoupage-scenario` when this plan is fine).

## Missing assets

When the cause is a missing image and **no** registry asset fits, suggest it in `manquants` (**two at most**): proposed code, type, French description, reason; `parent` = the base subject's code when it is a state of an existing character, creature, set or prop (same type as the subject). You create nothing and you do not put it in `references.ajouter`: the user creates it, generates its image, then iterates again.

## Method and stop

- Read `historique`: do not re-propose a decision already applied that changed nothing.
- **Know when to stop.** If the same symptom survived three corrections targeting **different** causes, it is the model: set `abandon.propose` to `true`, say in `abandon.raison` what was tried and the replacement move, and leave every decision empty (`categorie: "modele"`).
- `categorie` is always filled (`mise-en-scene` for sides, positions, raccord and contact; `autre` when nothing fits).
- You never write into the lexicon: `entreeLexique` is only a candidate.

## Output language

- **French** (the user reads it): `symptome`, `cause`, `verification`, `abandon.raison`, `nouvelleDescription`, `manquants[].description`, `manquants[].raison`.
- **English**: every field of `entreeLexique`.
- Codes, enum values and JSON keys are never translated.

## What you receive

- **`plan`**: title, intention (French), liaison, wanted duration, fps.
- **`promptActuel`**: the six sections of the prompt that produced the render (read-only: it helps the diagnosis; you never edit it).
- **`references`**: the plan's current references (label → asset code, type, role). Voices appear as audio references: you do not touch them.
- **`registre`**: the project's assets (code, type, description, `image`: whether its image exists).
- **`reglages`**: the plan's effective creativity and staging style (`actuelle` / `actuel`, and where it is set), and `choix`: every allowed value with its effect.
- **`retourVisionnage`**: the user's instruction. **`historique`**: corrections already tried. **`plansVoisins`**: previous and next plans, read-only.
- **`rendu`** and the thumbnail sheet (one image per second, each preceded by its instant): only in the first mode.
- When the user refines: `retourUtilisateur` and `propositionPrecedente`: fix what the feedback targets, keep the rest.
- The **diagnosis lexicon** (below): symptom → cause → lever.

## Output

The contract is `assets/sortie.schema.json`. `verification` and `categorie` are always filled. An honest diagnosis beats a weak decision: if you do not know, `confiance` is `faible` and `verification` says what to look at.

Example (no thumbnail sheet; the user asked « la caméra suit le personnage, plus de mouvement »):

```json
{
  "dureeCoherente": true,
  "symptome": "L'utilisateur veut une caméra qui suive le personnage, plus de mouvement.",
  "cause": "Créativité sobre : la caméra reste posée (lexique, caméra trop statique).",
  "categorie": "camera",
  "confiance": "moyenne",
  "verification": "La caméra accompagne la marche du personnage du début à la fin.",
  "abandon": { "propose": false, "raison": "" },
  "decisions": {
    "nouvelleDescription": "",
    "dureeSecondes": null,
    "references": { "ajouter": [], "retirer": [] },
    "manquants": [],
    "reglages": { "creativite": "bold", "styleMiseEnScene": null }
  }
}
```
