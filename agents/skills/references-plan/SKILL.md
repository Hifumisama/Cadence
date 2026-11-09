---
name: references-plan
description: Check and complete the reference images of ONE video plan from the asset registry, when the automatic choice has doubts; flag at most two missing assets. Never rewrites the plan.
metadata:
  language: instructions in English; `pourquoi`, `description`, `raison` and `notes` in French
---

# references-plan — which registry images go with this plan

A video model receives, for each plan, a short text and **up to 6 reference images** taken from the project's asset registry (characters, sets, props, effects). The images fix what things look like: without the right image, the model draws another face or another place. Code has already chosen what it could (`dejaChoisis`) and listed what it could not settle (`doutes`). You settle those doubts and return the **final list**. You do not write or change the plan text.

## Input

- `plan.intention` (French): what is seen and happens. `plan.repliques`: who speaks (names). `plan.dureeSecondes`.
- `scene`: its title and mood (time of day, light).
- `dejaChoisis`: the references code picked, with why. Usually right: keep them unless a doubt says otherwise.
- `doutes`: what code could not decide (no set named, a name not found in the registry, a subject or one of its states, too many images…). Answer each one.
- `decorPrecedent`: the set of the previous plan when this plan continues it, else null.
- `candidats`: the registry (`code`, `type`, `nom`, short `description`, `parent` = the subject this asset is a state of, `aUneImage`).
- `assetsProposesParLeLot`: assets already proposed elsewhere and about to be created; you may use their codes, never propose them again.
- `limiteImages`: 6.

## Output

`references` (final ordered list), `manquants` (usually empty, 2 at most), `notes`. Short: the whole answer stays under 300 tokens.

## Rules

1. **Codes are copied exactly** from `candidats` or `assetsProposesParLeLot`. Never invent, shorten or translate a code. A code that is neither is an error.
2. **Start from `dejaChoisis`.** Remove one only if a doubt or the text shows it is wrong; add what the text shows and the list lacks.
3. **Show what the plan shows.** A character who is seen or speaks, the set where it happens, a prop held or seen up close: each gets its image. Something only mentioned (a memory, a name in a sentence, a far-off nation) does not.
4. **Match by meaning, not only by words.** The text may call an asset by another name (« la lampe » for `PROP_lanterne`, « le rivage » for `DEC_plage`). Read `nom` and `description`.
5. **One set.** Pick the candidate `decor` whose description fits the place and light of the plan. No set named and `decorPrecedent` given: take it. Nothing fits: choose the closest set and say so in `notes`, or declare it missing (rule 9).
6. **One face per character.** A character and its states (`parent`) are the same person: keep only the one the plan shows (the state when the text describes that state, the base subject otherwise).
7. **Order:** speakers first (in the order of `plan.repliques`), then other characters, props and other objects, effects, keyframes, the set last.
8. **6 images at most**, missing assets included. Over the limit, keep what carries identity (faces, the set), then what is held or seen close; drop what the text can describe alone. Say what you dropped in `notes`.
9. **Missing assets: last resort, 2 at most.** Only when the plan cannot work without an image that **no** candidate can play, even under another name. Never a sound, a voice (it belongs to the character) or an effect (it stays in the text). A state of an existing subject (the same set at night, the same object broken) has that subject as `parent`, same type. Code = prefix of the type (`CHAR_`, `DEC_`, `PROP_`, `KEY_`, `OTH_`) + lowercase words joined by `_`, not already used. A missing asset is **not** listed in `references`.
10. **Effects (`vfx`)**: add one only if the plan shows that effect and the registry has it. An effect is a material, never the subject of the plan.
11. **Keyframes** (a composed pose): only if the text names it; never in addition to the assets it combines.
12. **Never rewrite the plan.** No new text, no advice on the story. `notes`: one or two short French sentences on what you decided, empty if nothing.

## Example

Input (shortened): `plan.intention` = « Sur la jetée au crépuscule, Lina tend la lanterne au vieux pêcheur. » ; `repliques` = [{"nom": "Lina"}] ; `dejaChoisis` = [{"code": "CHAR_lina", "pourquoi": "locuteur « Lina »"}] ; `doutes` = [{"type": "decor_introuvable", …}, {"type": "nom_inconnu", "detail": "« pêcheur »…"}] ; `candidats` include `CHAR_lina`, `CHAR_vieil_homme` (« vieux marin, barbe blanche »), `PROP_lampe_huile`, `DEC_port_jour`, `DEC_port_nuit` (parent `DEC_port_jour`).

Output:

```json
{
  "references": [
    { "code": "CHAR_lina", "pourquoi": "locutrice, à l'image" },
    { "code": "CHAR_vieil_homme", "pourquoi": "le vieux pêcheur" },
    { "code": "PROP_lampe_huile", "pourquoi": "la lanterne tendue" },
    { "code": "DEC_port_nuit", "pourquoi": "la jetée au crépuscule" }
  ],
  "manquants": [],
  "notes": "La lanterne est PROP_lampe_huile ; le port de nuit convient mieux au crépuscule que celui de jour."
}
```

## Before you answer

- Every doubt has an answer (in the list or in `notes`).
- Every code is copied exactly; one set; one face per character; speakers first, set last.
- `references` + `manquants` ≤ 6; `manquants` ≤ 2, and none duplicates a candidate.
- Nothing of the plan text was rewritten.
