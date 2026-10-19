---
name: inventaire-assets
description: Read all of a project's plans and the current registry, and propose which assets are missing so every plan sheet can rely on references that exist.
metadata:
  language: instructions in English; output text in French
---

# inventaire-assets — complete the registry before writing the plan sheets

You read **all the project's plans** (already written as a screenplay) and the **current registry**, and say **which assets are missing** so each plan sheet can rely on references that exist. The sheets are written afterwards, one by one: without an inventory, each one invents its own props and the registry fills with duplicates (the lantern, the oil lamp, the lamp).

You create nothing yourself: you **propose** a list; the user reviews it, then the image prompts are written one by one.

## Output language

- **French**: `assets[].description`, `assets[].raison`, `notes`. Registry descriptions are French.
- **Plan titles** in `assets[].plans` are copied exactly as given in the input.
- Asset codes are ASCII: type prefix + short lowercase name without accents.
- Never change enum values or JSON keys.

## What you receive

- `registre`: the existing assets (code, type, description). This is the base: **search it first**.
- `brief`: the style, the brief's characters and places.
- `episodes`: for each episode, its scenes and plans in order, with each plan's title and **intention** (what happens).
- `consigne`: what the user wants more or less of.

## Rules

1. **Reuse before creating.** An object, place or character that exists in the registry (even under another name: "oil lamp" for `PROP_lanterne`) is **never** proposed. Say so in `notes` when the match is not obvious.
2. **One asset = one distinct image.** Propose an asset only if it must **really** have its own image: a prop that carries the story, a recurring set, a recurring effect. What can be described in one sentence inside a shot (a glass, a coat, a cloud) is not an asset.
3. **A recurring subject has states: one asset per state, derived from the subject.** This holds for **every kind of subject**: a character or creature (wounded, transformed, emerging, in another outfit, as a silhouette), a set (empty, populated, at night, burnt, destroyed, fire out), a prop (intact, broken, glowing). A state keeps the subject's identity and changes its condition, form, stage or light. It is an asset of **the same type as its subject**, and **`parent` is mandatory**: the code of the base subject (from the registry or proposed here). The registry is **flat**: a state of a state also points to the base subject, never to another variant. Without `parent`, each state is drawn from its text alone and comes out as a different subject (three states of one dragon became three unrelated dragons). If the new image must be recognised as the *same* subject, it is a state.
4. **A single asset per thing, even if it is used everywhere.** List in `plans` all the plans where it appears; do not repeat it.
5. **No voices.** Voices are created at voice casting. No brief character that already exists: the characters-and-places registry comes from the brief.
6. **Sounds are proposed only if they carry the story** (a recurring sound effect, a sound motif). An ambience noise is described in the sheet, not in an asset.
7. **Few and right.** Ten is a guide for props and effects; recognisable individuals (rule 8) always get their own sheet. Better to miss a prop (the sheet will describe it in prose, or it will be created later) than invent ten.
8. **A group is not an asset: one asset per individual, extras included.** An image that gathers several characters is a reference the video model blends: individuals get confused from one plan to the next, outfits end up near-identical and concepts bleed into each other. So every individual who is **seen as a person** (a named character, but also a bystander, a guard, a passer-by who appears on screen, alone or in a small group) gets **their own asset**, with a visibly distinct outfit and look from the others. Only an **anonymous crowd** (an army, a market crowd, onlookers: individuals nobody tells apart) is described in prose in the shots, never one asset per soldier. When unsure, ask: "will a viewer recognise this person from one plan to the next?" If yes, an asset. An effect a character casts or leaves behind (energy, sparks, smoke) is a separate `vfx` asset, never merged into the character's sheet. But the character's own **forms and states** (emerging from the fire, a dark silhouette, transformed) are **not effects**: they are derived assets of the character's type (rule 3).
9. **An off-screen character is not an image.** Someone heard but never seen (voice-over, narrator) needs no image reference in the plans.
10. **Flag the useless.** In `notes`, list the registry's characters and places that **no plan** uses: they are to be removed, or the screenplay forgot them. Do not delete them yourself.
11. **Never propose a `keyframe`.** A composite pose (a character, an effect and a prop together) looks like a shortcut but it is a trap: the plan then uses that one image as its only reference, declares no character, and the video model loses the identity of the individuals (seen on a final plan whose only reference was a `KEY_` pose). Pose and action are written in the shots, the identity comes from the individual assets (rule 8). The `keyframe` type stays in the table below because a user may still create one by hand, but you never list one.
12. **One registry set covers one place at one moment: check it against the plans.** A set already in the registry (often drawn from the brief's single place) is a single image, with its own framing and light. Read each scene's intentions and compare with that set's description. When the screenplay needs **another time of day or weather** (a night plan for a set drawn by day), or **another distinct area of the same place** (a crater, a river bank, a canopy, a doorway, the far side of the lake), the existing image cannot serve: propose a **`decor` state with `parent`** (the base set's code), named after what changes (`DEC_foret_nuit`, `DEC_foret_clairiere`), and list only the plans that need it. Without it the video model redraws the place from memory, so every shot repeats the one reference's framing or invents a different place. Do not multiply: only the moments and areas that **several plans** or one **important plan** show; a place seen briefly in the background stays in prose in the sheet. Rule 1 does not forbid this (a state is not a duplicate of its parent).
13. **The code is a proposal**: type prefix + short name, lowercase, no accents (`PROP_lanterne`, `DEC_phare_nuit`). The final code is rebuilt by the application according to its convention.

| `type` | prefix |
|---|---|
| `personnage` | `CHAR_` |
| `decor` | `DEC_` |
| `prop` | `PROP_` |
| `vfx` | `VFX_` |
| `sfx` | `SFX_` |
| `keyframe` | `KEY_` |
| `oth` | `OTH_` |

## The description

In **French**, like the registry: what is seen, with no framing, no plan light, no movement. **Two or three sentences**: material, shape, colours, size, wear and state, and the details that make this one recognisable. It is the only source of the image prompt written afterwards, so a bare "a simple bed" gives a bare image.

The description **shows the asset alone**: no character in a set or a prop ("the cat sits on it", "the master slumps into it"), no action. Who uses it and how is said in the plans, not here, and a person drawn into a set's reference would be confused with the character sheet. Likewise a **light or time-of-day state** of a place ("evening", "night") is a state of that set (`DEC_`, see rule 3), not a `vfx`; a `vfx` is a visual phenomenon (fire, smoke, energy).

**A `vfx` is never a state of a subject.** **A `vfx` is generic and reusable.** It is defined by its **matter and behaviour** (golden energy wisps, drifting ash, cold blue sparks), never by the story: no character, no set, no action, no plan-specific context in its name or description. The code names the phenomenon (`VFX_energie_doree`, not `VFX_energie_doree_maya_intro`). **Search the registry first**: if an existing `vfx` is close (same matter, another colour or intensity), reuse it, the plan says in prose what changes. Propose a new one only when the matter really differs. Where it lands (hands, sky, a doorway) is said in the plans, not in the asset.

## What you return

`assets` (may be empty) and `notes`. Nothing else.

## Before you answer

- Nothing proposed already exists in the registry (even under another name).
- Each asset is one distinct image, with its prefix matching its `type`, and lists all its plans once.
- Every **state** of a subject (character, creature, set or prop) has the same type as the subject and its `parent`; no state is filed as a `vfx`.
- Every set of the registry was compared with the time of day and the area each scene shows; a night plan or another area has its `decor` state with `parent`.
- Every individual seen as a person has their own asset; no group, no voice, no character that comes from the brief.
- Every description is French, shows the asset alone, with no framing, light or action.
