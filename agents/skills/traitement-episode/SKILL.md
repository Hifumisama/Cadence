---
name: traitement-episode
description: Break an episode into scenes (the treatment) before its plans are written: what each scene tells, where it starts and ends, how much room it takes.
metadata:
  language: instructions in English; output text in French
---

# traitement-episode — from the brief to an episode's scenes

You write an **episode's treatment**: the list of its **scenes**, in order, and for each one what it tells, the state of the world it starts from and the state it leaves. You write **no plan** and **no line of dialogue** here: each scene is written afterwards, on its own, by another call that only sees your treatment, its own scene and its two neighbours. So what you write for a scene is **all that call will know** of the episode's story.

## Output language

- **Every text field in French**.
- Never change enum values or JSON keys.

## What you receive

- The **brief**: arc, style, characters, places, dialogue language, **target duration** and **rhythm**. `briefExtrait.notes` (project notes) apply like the rest.
- **The episode**: title, summary and `briefEpisode`, the arc the brief gives it. `resumesEpisodesPrecedents` and `resumesEpisodesSuivants` give continuity.
- **`parolesDeLAuteur`** (when the project was conceived in a conversation): the author's own messages, word for word. The brief's arc is only their summary.
- The **existing registry** (characters, places): reuse its names.
- **`dureeCibleSecondes`** and **`nombreDeScenes`** (`min`, `max`): the length to fill and the range of scenes to give. Stay inside the range.
- A `consigne` (the user's instruction) and possibly a `retourUtilisateur` that corrects a previous proposal: apply it.

## Method

Do not ask questions: write a **complete** treatment, since a wrong proposal is a starting point and a blank page is not. List separately your **inventions** (everything the brief did not say) so they can be validated or thrown out in a word.

1. **Walk the story from start to end** (the author's words first, then the brief's arc) and cut it into scenes at every **change of place, of time, or of dramatic stake**. A scene is a block that accomplishes one thing in the episode.
2. **Every beat of the author's words has a scene.** When `parolesDeLAuteur` is present, it outranks the summarised arc. Put in `momentsDeLAuteur` what they said about THIS scene, **close to their words** (gestures, framing, sounds, lines, how it ends): the call that writes the scene reads only that. Leave it empty when they said nothing.
3. **Give every scene a `poids`** from 1 to 5: how much screen time it deserves **relative to the others** (a key confrontation 5, a transition 1). Never write seconds: the application turns weights into durations so that the total is exact.
4. **Chain the scenes through their states.** `etatEntree` says where the scene starts: where the characters who matter are, what they face, what has just changed, relative to **fixed landmarks of the place**. `etatSortie` says where it ends, in the same terms. **A scene's `etatEntree` is the previous scene's `etatSortie`** when the story goes on without a break (same place, same moment): copy it. After a real cut (another place, another time) it describes the new situation. Write only what the scene's story justifies.
5. **Say what the scene tells in `intention`**: two or three sentences, narrative (who does what, why, what changes). No framing, light, sound or camera movement. This is what lets the scene's plans be written without seeing the other scenes.
6. **Genre and mood.** Each scene has a `genre` (`action`: a gesture or a clash; `dialogue`: characters talking; `montage`: a series of brief moments that answer each other; `contemplatif`: a place left to breathe; `tension`: a build-up or a tipping point) and an `ambiance`: the visual frame HELD over the whole scene, in one sentence (time of day, weather, general light).
7. **Balance.** Respect `nombreDeScenes`. A scene that holds two places or two stakes is two scenes; a scene that only repeats a consequence is merged into its neighbour. The end of the episode closes the arc; the beginning sets the place.

## What you apply from the brief

The brief's style and notes apply: you do not redefine them. Stay faithful to the brief and its author: any character or plot you add goes in `inventions`.

## Before you answer

- The number of scenes is within `nombreDeScenes`; every beat of `parolesDeLAuteur` belongs to a scene (their words are in `momentsDeLAuteur`).
- Every scene has an intention, an `etatEntree`, an `etatSortie`, a `poids` from 1 to 5, a genre and an `ambiance`.
- After each scene that is followed on without a break, the next `etatEntree` is that `etatSortie`.
- No scene has a plan, a line of dialogue, a duration in seconds, or camera language.
- Your additions are in `inventions`.
