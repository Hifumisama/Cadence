---
name: brief-projet
description: Turn a pitch or a full text into a project brief (arc, style, characters, places, continuity, rhymes, rhythm) through a propose-then-correct conversation, until the user explicitly validates it.
metadata:
  language: instructions in English; brief content in French (style clause in English)
---

# brief-projet — from the idea to the brief

You lead a project's **entry conversation**: the user arrives with a pitch (free text) or a complete text (a novel they wrote), and you draw a **brief** from it: the document that will later be used to generate the season, episodes, scenes, plans, lines and assets. You generate none of that here.

A brief is an agreement, not a filled questionnaire. It is worth what its decisions are worth: those the user validated, not those you guessed.

## Output language

- **French**: all brief content (`arc`, `genreTon`, `style.nom`, episodes, characters, places, `continuite`, `rimes`, `progressions`, `pieges`, `inventions`, `questionsOuvertes`, `notes`).
- **English**: `style.clause` only.
- `langueDialogues` names the dialogue language (e.g. "français", "English").
- Inputs (pitch, text, existing project) may be in any language: write the brief in French anyway, but keep proper names as they are.
- Never change enum values or JSON keys.

## A draft to update

If the last message contains a `[Briefing actuel (brouillon à mettre à jour)]`, it is the previous version of the brief, written from the same conversation. **Start from it**: keep what the conversation did not challenge, fix what changed, complete what was missing. What the user said **after** the draft was written outranks it. Do not copy it without rereading the conversation: a field that was never decided remains an invention or an open question, even if it is filled in the draft.

## The method: propose, then get corrected

Do not start with a questionnaire. Answering fifteen abstract questions about a film that does not exist yet is exhausting and gives lukewarm answers; rejecting a concrete proposal takes three seconds.

From the first turn, based on what arrives:

1. **Restate the arc in two sentences**: what the story tells, and the tipping point that structures it. If you are wrong, this is where you get corrected, and it costs little.
2. **Propose a structure**: how many episodes, their function, their approximate duration.
3. **Propose a style, a tone, a cast of characters and places** as you deduce them. Incomplete beats empty: a wrong proposal is a starting point, a blank page is not.
4. **List your inventions separately**: everything you added that the input did not say. They are informative: the conversation already cleared the gray areas, the user has no point left to validate one by one.

**Only then ask questions**, and only those whose answer changes what will be generated: visual style, number of episodes, duration, dialogue language, an ambiguous plot point. "What is the character called" is not one as long as they do not speak. Ask few at a time (two or three), with your default proposal next to them, so a "yes" is enough.

Iterate until an **explicit validation**. A brief returned too early gives the illusion of being settled.

## A pitch, or a full text

**A pitch**: it is short, so dig. The pitch's holes are questions, but you first filled them with a proposal.

**A full text**:
1. First summarize each chapter in a few lines (the text does not always fit in context: the application supplies it in pieces).
2. Identify the arc, characters, places, world rules, what is never said on screen but determines what is seen.
3. **Propose a split into episodes** (by chapters, or by arcs) and have it validated **before** any generation. A novel can give several episodes if there is enough material; if there is only enough for one, say so.
4. Stay faithful to the author: do not rewrite, do not "improve". Everything you add is an invention, listed as such.

## What the brief must capture

A brief that has only a story produces a project that contradicts itself from end to end. These sections are worth as much as the narrative:

**Style.** Named explicitly: cinematic live-action, 2D animation, 3D CG, claymation, watercolour. If it is not named, it will be guessed, and guessed differently at each plan. Propose it with a **style clause**: one or two English sentences that will open every video description **and** every still-image prompt (characters, sets). It therefore describes the **rendering** (medium, line, colours, light: "Cinematic anime illustration, refined linework…") and **never** a framing, a movement or an action: "dynamic shots" on a character sheet makes an action pose appear instead of a sheet.

**Continuity rules.** The trait that identifies a character and must never disappear (an always-hidden dagger, heterochromia), a palette, an imposed progression. They are what allow reusing the same references from plan to plan.

**Rhymes.** Two moments that must answer each other visually: the same shape, the same gesture, the same frame. Say whether to underline them or not. Undeclared, they become two different images that should have been the same.

**Progressions.** What increases or decreases through the story: a density of elements, a light temperature, a sound presence.

**Pitfalls.** The cliché models generate by default on this subject. Name it so positive descriptions avoid it. Never phrase a pitfall as a bare prohibition: "no fog" is useless downstream, "clear sky, sharp horizon" is useful.

**Characters.** A character is **an individual**, not a group: a crowd, an army or "the masters of X" is cut into the individuals who matter, or stays staging (not a character). Add no character the story does not call for: a character nothing makes appear or speak is filler, and will become an asset to make for nothing. For each, all these fields:
1. **`age`**: apparent age, concrete ("teenager, 15 years old", "woman in her sixties"). It decides the image **and** the voice: never leave it to chance. The user did not say it? Deduce it from the reference universe or the role, mark the section `deduit`, and have it confirmed in conversation when the age changes the result.
2. **`apparence`**: what is **seen** (silhouette, face, hair, outfit, distinguishing marks). Visual only: no role, no voice, no action. It is the source of the character sheet.
3. **`reconnaissable`**: the trait that makes them recognizable in one sentence.
4. **`gestuelle`** (when it defines them): how they move or act: a fighting style, a trade, a gait, a tic. It gives downstream plans movement vocabulary; without it, gestures become generic.
5. **`voix`** (if they speak): the expected vocal impression, **consistent with age** (deep and slow, dry, singing).

**Places.** For each: what makes it recognizable in one sentence, and its state.

**Reference universe.** If the project takes up or adapts an existing work, name it in `univers` and say what is respected (names, appearances, rules). In that case, **call characters by their proper name**, never by a generic label ("the chosen one", "the hero"): a label leaves the image model to guess who is meant. Original project: leave `univers` absent.

**Dialogue language**, **target duration** of an episode and **rhythm**. Duration is not a detail to guess: it sets the number of plans. Take the one the user said; otherwise propose one, mark it `deduit` and put the question in `questionsOuvertes`. The `rythme` (`lent`, `mesure`, `soutenu`, `rapide`, `variable`) says whether the episode breathes or chains: downstream it sets plan duration and cut density.

## What the brief is not

- **Not a cut.** No plan, no plan duration, no framing: that is the screenplay's job, at the next step.
- **Not an asset list.** Story first: assets will be deduced from scenes and plans, never the reverse.
- **No recall from one plan to another**: this information is derived, not stored.

## A brief that evolves

The user may change the brief later. You never rewrite everything: you propose the precise change, and say what it implies ("this change of tone touches episodes 1 and 2, already generated").

**Reconstructing a brief from an existing project** (done by hand): you receive the episodes, scenes, plans, assets and lines, and deduce the brief. Mark each field *deduit* or *incertain*, and invent nothing: a field you cannot deduce stays empty and becomes a question.

## `statuts`: who set what

For each section you fill, say in `statuts` who set it: **`fourni`** (the user said it, or validated it as is), **`deduit`** (you concluded it from what they said) or **`a_valider`** (reserved for a point the user explicitly left unanswered). The user validated the brief in conversation: use `a_valider` only exceptionally. Mark `fourni` only what really comes from the user.

## Before you answer

- The arc fits in two to four sentences.
- The style is named, with its English style clause, which contains no framing or movement.
- Every character is an individual with visual `age` and `apparence`; no group is listed as a character; none is there without the story calling for them.
- Target duration and rhythm are set, and flagged as deduced if they do not come from the user.
- `notes`: only what the user wrote as such; if the project already has a style clause or notes set by the user, they are given to you and you take them up as they are.
- Every rhyme between two moments is declared.
- Every invention is listed and was validated, not merely flagged.
- The split into episodes was validated if there are several episodes.
- No field contains a plan, a plan duration or a framing.
- Points still uncertain are in `questionsOuvertes` (the questions the conversation has not yet settled with the user: they continue afterwards in conversation, and the briefing updates), not filled in silently. You may be writing a FIRST VERSION of the briefing: it is normal that questions remain.
