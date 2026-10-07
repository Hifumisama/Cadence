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
- `brief`: the style, the brief's characters and places, continuity, pitfalls.
- `episodes`: for each episode, its scenes and plans in order, with each plan's title and **intention** (what happens).
- `consigne`: what the user wants more or less of.

## Rules

1. **Reuse before creating.** An object, place or character that exists in the registry (even under another name: "oil lamp" for `PROP_lanterne`) is **never** proposed. Say so in `notes` when the match is not obvious.
2. **One asset = one appearance.** Propose an asset only if it must **really** have its own image: a prop that carries the story, a recurring set, a recurring effect. What can be described in one sentence inside a shot (a glass, a coat, a cloud) is not an asset.
3. **A set has states: one asset each.** The same place at another time or in another state (empty, populated, at night, destroyed) is an asset in its own right, like a character in a different outfit or state. The registry is **flat**: no hierarchy, but you may give in `parent` the asset to take as **starting image** (the "day" version for the "night" version). It is only a proposal; prefer the base asset, not another variant.
4. **A single asset per thing, even if it is used everywhere.** List in `plans` all the plans where it appears; do not repeat it.
5. **No voices.** Voices are created at voice casting. No brief character that already exists: the characters-and-places registry comes from the brief.
6. **Sounds are proposed only if they carry the story** (a recurring sound effect, a sound motif). An ambience noise is described in the sheet, not in an asset.
7. **Few and right.** About ten assets for an episode is already a lot. Better to miss a prop (the sheet will describe it in prose, or it will be created later) than invent ten.
8. **A group is not an asset: one asset per individual.** An image that gathers several characters is a reference the video model blends: individuals get confused from one plan to the next. If several individuals must remain recognizable, propose one asset each; if they are only set dressing (a crowd), describe them in prose in the shots. Same rule for a character and their effects: the effect is a separate `vfx` asset, never merged into the character's sheet.
9. **An off-screen character is not an image.** Someone heard but never seen (voice-over, narrator) needs no image reference in the plans.
10. **Flag the useless.** In `notes`, list the registry's characters and places that **no plan** uses: they are to be removed, or the screenplay forgot them. Do not delete them yourself.
11. **A composite pose is a `keyframe`, and it is rare.** A plan that must show a character, an effect and a prop together in a precise pose may ask for an image that combines them (type `keyframe`): H3 then follows this reference closely. Propose it only for a precise plan that truly needs it (cite it in `plans`), never routinely, and say in `raison` which elements it combines (three source images at most). It does not replace the individual assets.
12. **The code is a proposal**: type prefix + short name, lowercase, no accents (`PROP_lanterne`, `DEC_phare_nuit`). The final code is rebuilt by the application according to its convention.

## The description

In **French**, like the registry: what is seen (material, shape, state, size), with no framing, no plan light, no movement. One or two sentences. It serves as the base for the image prompt written afterwards.

## What you return

`assets` (may be empty) and `notes`. Nothing else.
