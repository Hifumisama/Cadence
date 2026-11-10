---
name: inventaire-assets
description: Read all of a project's plans and the current registry, propose which assets are missing, and choose the reference images of every plan, so every plan sheet can rely on references that exist.
metadata:
  language: instructions in English; output text in French
---

# inventaire-assets — complete the registry and pick each plan's references before writing the plan sheets

You read **all the project's plans** (already written as a screenplay) and the **current registry**, and you do two things in one answer:

1. say **which assets are missing** so each plan sheet can rely on references that exist. The sheets are written afterwards, one by one: without an inventory, each one invents its own props and the registry fills with duplicates (the lantern, the oil lamp, the lamp);
2. for **every plan**, list the assets whose images the video model will receive (`references`): existing assets or the ones you propose in this same answer. They are ready before the sheets are written, and the user reviews them together with the plans' intentions.

You create nothing yourself: you **propose**; the user reviews, then the image prompts are written one by one.

## Output language

- **French**: `assets[].description`, `assets[].raison`, `notes`. Registry descriptions are French.
- **Plan titles** in `assets[].plans` are copied exactly as given in the input.
- Asset codes are ASCII: type prefix + short lowercase name without accents.
- Never change enum values or JSON keys.

## What you receive

- `registre`: the existing assets (code, type, description). This is the base: **search it first**.
- `brief`: the style, the brief's characters and places, and what the interview noted about how they look (all optional):
  - `personnages[].tenue`: the outfit (`coupe`, `couleurs`, `matieres`, `accessoires`, `signeDistinctif`, `evolution`);
  - `lieux[].aspect`: the place's look (`lumiere`, `matieres`, `palette`, `ambiance`);
  - `elements`: the visual effects (`nature: "vfx"`) and story objects (`nature: "prop"`) the user described, with `description`, `couleur`, `ampleur` (size or extent), `comportement` (how it moves).
  Each carries a `statut`: `fourni` (the user said it), `delegue` (the user let the agent choose: decided), `deduit` (assumed by the agent, nobody confirmed), `incertain` (said in vague terms). `deduit` and `incertain` are leads, not facts: use them, and say in `notes` what stays to confirm.
- `episodes`: for each episode, its scenes and plans in order, with each plan's `id` (P01, P02…: the handle you copy into `references`), title and **intention** (what happens).
- `consigne`: what the user wants more or less of.
- For a long film only, you see **one part** of it (`partie`: "2/3", consecutive scenes) and `assetsDejaProposes`: the assets the previous parts already propose. They are not in the registry yet, but treat them as if they were: **never propose them again** (rule 1), and use their codes in `references` like registry codes.

## Rules

1. **Reuse before creating.** An object, place or character that exists in the registry (even under another name: "oil lamp" for `PROP_lanterne`) is **never** proposed. Say so in `notes` when the match is not obvious.
2. **One asset = one distinct image.** Propose an asset only if it must **really** have its own image: a prop that carries the story, a recurring set. What can be described in one sentence inside a shot (a glass, a coat, a cloud, **any visual effect** that `brief.elements` does not list) is not an asset.
3. **A recurring subject has states: one asset per state, derived from the subject.** A state keeps the subject's identity and changes its condition, form, stage or light. It is an asset of **the same type as its subject**, and **`parent` is mandatory**: the code of the base subject (from the registry or proposed here). The registry is **flat**: a state of a state also points to the base subject, never to another variant. Without `parent`, each state is drawn from its text alone and comes out as a different subject (three states of one dragon became three unrelated dragons). If the new image must be recognised as the *same* subject, it is a state.
   - **Sets and props** have states freely: a set empty, populated, at night, burnt, destroyed, fire out; a prop intact, broken, glowing.
   - **A character or creature has a state only for a LASTING change of its visual identity**: another age (the same girl at sixty), or an appearance that changes completely and stays that way over several scenes (a creature metamorphosed for good, a full new costume after a time jump). Ask: "does the character look like someone else from now on?" If not, it is not an asset.
   - **Never a character state**: on fire, surrounded by energy or an aura, glowing, wounded or bleeding, dirty, wet, as a silhouette or a shadow, emerging, fading or disappearing, any visual effect on or around the body. These are **momentary**: they are written in prose in the plans, where the video model applies them to the character's normal sheet (seen in testing: a "hero in flames" state became a second character instead of the hero on fire).
4. **A single asset per thing, even if it is used everywhere.** List in `plans` all the plans where it appears; do not repeat it.
5. **No voices.** Voices are created at voice casting. No brief character that already exists: the characters-and-places registry comes from the brief.
6. **Sounds are proposed only if they carry the story** (a recurring sound effect, a sound motif). An ambience noise is described in the sheet, not in an asset.
7. **Few and right.** Ten is a guide for props and effects; recognisable individuals (rule 8) always get their own sheet. Better to miss a prop (the sheet will describe it in prose, or it will be created later) than invent ten. The entries of `brief.elements` are not inventions: they are always proposed (rule 14).
8. **A group is not an asset: one asset per individual, extras included.** An image that gathers several characters is a reference the video model blends: individuals get confused from one plan to the next, outfits end up near-identical and concepts bleed into each other. So every individual who is **seen as a person** (a named character, but also a bystander, a guard, a passer-by who appears on screen, alone or in a small group) gets **their own asset**, with a visibly distinct outfit and look from the others. Only an **anonymous crowd** (an army, a market crowd, onlookers: individuals nobody tells apart) is described in prose in the shots, never one asset per soldier. When unsure, ask: "will a viewer recognise this person from one plan to the next?" If yes, an asset. An effect a character casts or leaves behind (energy, sparks, smoke) is **not an asset either** (rule 13), unless `brief.elements` lists it (then it is its own `vfx`, rule 14): it is written in the shots, never merged into the character's sheet. Likewise a character on fire, glowing, wounded, as a silhouette or vanishing is **not** a new asset (rule 3): only a lasting transformation of their look (another age, a complete and permanent change of appearance) is a derived asset of the character's type.
9. **An off-screen character is not an image.** Someone heard but never seen (voice-over, narrator) needs no image reference in the plans.
10. **Flag the useless.** In `notes`, list the registry's characters and places that **no plan** uses: they are to be removed, or the screenplay forgot them. Do not delete them yourself.
11. **Never propose a `keyframe`.** A composite pose (a character, an effect and a prop together) looks like a shortcut but it is a trap: the plan then uses that one image as its only reference, declares no character, and the video model loses the identity of the individuals (seen on a final plan whose only reference was a `KEY_` pose). Pose and action are written in the shots, the identity comes from the individual assets (rule 8). The `keyframe` type stays in the table below because a user may still create one by hand, but you never list one.
12. **One registry set covers one place at one moment: check it against the plans.** A set already in the registry (often drawn from the brief's single place) is a single image, with its own framing and light. Read each scene's intentions and compare with that set's description. When the screenplay needs **another time of day or weather** (a night plan for a set drawn by day), or **another distinct area of the same place** (a crater, a river bank, a canopy, a doorway, the far side of the lake), the existing image cannot serve: propose a **`decor` state with `parent`** (the base set's code), named after what changes (`DEC_foret_nuit`, `DEC_foret_clairiere`), and list only the plans that need it. Without it the video model redraws the place from memory, so every shot repeats the one reference's framing or invents a different place. Do not multiply: only the moments and areas that **several plans** or one **important plan** show; a place seen briefly in the background stays in prose in the sheet. Rule 1 does not forbid this (a state is not a duplicate of its parent).
13. **Never invent a `vfx`.** An effect image is followed far too literally by the video model (it copies it as a subject instead of adapting it), and most effects (fire, smoke, dust, sparks, energy, glow) are better written in the plan's text, where the model adapts them to the scene. An effect you find only in the plans is described in the plans; do not list it. And never smuggle an effect in as a character or set state ("the hero in flames", "the hero's energy aura"): an effect stays prose, whatever the type you would file it under. **Single exception: rule 14** (an effect the user described in `brief.elements`). The registry's existing `vfx` are simply reused by the plans.
14. **`brief.elements` are assets to create, not to guess.** Each entry is one asset of the type its `nature` says: `vfx` → a `VFX_` asset, `prop` → a `PROP_` asset. Propose every one the registry does not already hold (rule 1 still applies: same thing under another name = reuse), even if few plans show it, and copy the entry's `nom` exactly into `element`. Its `description` is built from the entry's `description`, `couleur`, `ampleur` and `comportement`, translated into the registry's rules: a `vfx` is the phenomenon alone (matter, colour, density, movement), with **no character, no hand or body part and no set**, even when the entry names who casts it; a `prop` is the object alone. Every other asset has `element: null`. When the entry is `incertain` or `deduit`, still propose it, and say in `raison` which detail is still to confirm.
15. **The code is a proposal**: type prefix + short name, lowercase, no accents (`PROP_lanterne`, `DEC_phare_nuit`). The final code is rebuilt by the application according to its convention.

| `type` | prefix |
|---|---|
| `personnage` | `CHAR_` |
| `decor` | `DEC_` |
| `prop` | `PROP_` |
| `vfx` | `VFX_` |
| `keyframe` | `KEY_` |
| `oth` | `OTH_` |

## The description

In **French**, like the registry: what is seen, with no framing, no plan light, no movement. **Two or three sentences**: material, shape, colours, size, wear and state, and the details that make this one recognisable. It is the only source of the image prompt written afterwards, so a bare "a simple bed" gives a bare image.

The description **shows the asset alone**: no character in a set or a prop ("the cat sits on it", "the master slumps into it"), no action. Who uses it and how is said in the plans, not here, and a person drawn into a set's reference would be confused with the character sheet. Likewise a **light or time-of-day state** of a place ("evening", "night") is a state of that set (`DEC_`, see rule 3), never an effect.

- **A character's description is their appearance and nothing else**: age, build, face, hair, outfit, distinguishing marks. **No place, no pose, no action, no line of dialogue, no mood of a scene** ("assise sur un talus", "regarde la mer", "dit : …"): the image is a turnaround sheet on a plain background, and any place or pose written here is drawn into it (seen in testing: a heroine "sitting on a bank" came out sitting in a landscape instead of standing alone). Where the character is and what they do belongs to the plans. For a new character (an extra, a guard) or a character state, reuse what `tenue` gives when it applies (cut, colours, materials, worn accessories, distinctive mark); a state after a time jump takes the outfit `evolution` describes. A held object stays out (it is a prop).
- **A set's description is the place itself**: architecture or terrain, materials, vegetation, scale, layout. **Do not list the props** that sit in it (a lantern, a board, a chest): each prop is its own asset or prose in the plans, and a set image crowded with objects freezes them into every shot. Name an object only when it is a fixed, central part of the place (the giant whale skeleton the village is built in). For a state or another area of a brief place, keep its `aspect` (materials, palette) and change only what the state changes (the light of a night state, for instance).

## The references of each plan

`references` has **one entry per plan of the input**, in the input's order: `{ "plan": "<id>", "codes": [...] }`. The codes are the images the video model receives for that plan; what is not in them is drawn from the plan's text alone.

- **Codes that exist**: from `registre`, `assetsDejaProposes`, or the `assets` of your own answer (copy your proposed code exactly). Never a code you did not see. An asset you propose appears in the `references` of the plans that show it (its `plans` list), or it serves nothing.
- **Who and what is seen.** Every character seen in the plan (a speaker, a listener, an extra with its own sheet), the props that matter in the action, then the set. A character only heard (voice-over, narrator) has no image.
- **Order**: the characters who **speak** in the plan first (in the order they speak), then the other characters, the props, the effects, and the **set last**.
- **One sheet per character.** A character has one face in a plan: choose the state that fits the moment (the same character at sixty in the last scene), never two states of the same character together.
- **One set**: the set or set state that matches the plan's place, time of day and area (rule 12): a night plan gets the night state, not the day set.
- **6 images at most**, usually 2 to 5. When a plan shows more, keep the characters and the set, and drop the least important props and effects.
- **A `vfx`** (only one that exists or comes from `brief.elements`) may be listed when the plan shows that effect: the video model takes it as a weak style reference (its matter, colour and motion), never as a subject.
- **A `keyframe`** only when the plan's intention names it. Otherwise the identities come from the individual sheets (rule 11).
- **Never a voice**: voices are set on the character; sounds are written in the sheet.
- A plan with nothing to show (black screen, title card) gets an empty list; keep its entry.

## What you return

`assets` (may be empty), `references` (one entry per plan) and `notes`. Nothing else.

## Before you answer

- Every plan of the input has exactly one entry in `references`, with its `id` copied; every code there exists (registry, `assetsDejaProposes`, or your `assets`); at most 6 codes, characters who speak first and the set last; one sheet per character, one set, no voice, no sound, a keyframe only if the intention names it.
- Nothing proposed already exists in the registry or in `assetsDejaProposes` (even under another name).
- Each asset is one distinct image, with its prefix matching its `type`, and lists all its plans once.
- Every **state** of a subject (character, creature, set or prop) has the same type as the subject and its `parent`; no state is filed as a `vfx`, and the only `vfx` listed come from `brief.elements` (rules 13 and 14).
- Every entry of `brief.elements` the registry lacks is proposed once, with its type from `nature` and its `nom` copied into `element`; every other asset has `element: null`.
- Every **character state** is a lasting change of their look (age, a complete and permanent new appearance); none is fire, energy, aura, glow, wound, silhouette, disappearance or any other effect (rule 3).
- Every set of the registry was compared with the time of day and the area each scene shows; a night plan or another area has its `decor` state with `parent`.
- Every individual seen as a person has their own asset; no group, no voice, no character that comes from the brief.
- Every description is French, shows the asset alone, with no framing, light or action; a character's description holds only their appearance (no place, pose, action or dialogue), a set's description lists no props.
