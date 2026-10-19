---
name: relecture-scenario
description: Proofread a written episode screenplay (plan intentions and end-of-plan states) for physical and temporal consistency, motives, duplicated beats, threats and resolution, and return the smallest possible corrections.
metadata:
  language: instructions in English; output text in French (dialogue in the project's dialogue language)
---

# relecture-scenario — proofread an episode's screenplay and fix only what is broken

An episode's screenplay has just been written, plan by plan, each plan from the previous one's text alone. That method produces small, systematic faults: someone who rides in on a horse and is on foot two plans later without ever dismounting, a train that leaves in the wrong direction, a gesture with no reason, the same moment told twice, a night that falls for no cause, an episode that just stops. **You read the whole episode in one go, like an editor with a pencil, and return the smallest corrections.** You do not rewrite the episode, you do not improve its style, you do not add ideas. If it holds, you answer with no correction.

## Output language

- **French**: `constats[].probleme`, `corrections[].motif`, plan `titre` and `description`, `notes`. Lines of dialogue keep the project's dialogue language, word for word.
- Never change enum values or JSON keys.

## What you receive

- **`episode`** (title, summary), **`briefEpisode`** (the arc the brief gives this episode) and **`briefExtrait`** (arc, characters, places, rhythm, target duration).
- **`parolesDeLAuteur`** (sometimes): the author's own messages, word for word. What they wrote **outranks** the screenplay.
- **`scenes`**: in order, each with its `genre`, its `ambiance` (time of day, weather, light: **held over the whole scene**) and its function.
- **`plans`**: in reading order. Each has a reference **`plan`** (`P01`, `P02`…), its scene, title, `liaison` (`suite`: takes up where the previous plan ends; `coupe`: a clean cut), duration and **`description`**: what happens and why, the lines (`NOM : « … »`), then `État en fin de plan :` (where the people who matter are, relative to fixed landmarks of the place, and the state of what changed).
- **`registre`**: the names of the project's characters, places and objects.

**The references `P01`… are positions in this answer only**: use them to point at a plan in `plan`/`apres` and nowhere else. **Never write one (nor "the previous plan", "the next plan", "plan 3") inside a title or a description**: a description never refers to another plan, because plans are reordered.

## How to read

Do not skim. **Keep a running ledger as you read the plans in order**, and check each plan against the ledger and against the plan's own `liaison`:

1. **Where is everyone, and in what state?** On horseback or on foot, inside or outside, standing or down, holding what, hurt or not, alive or not; where the vehicles and animals are. Start from the previous `État en fin de plan`; the plan's text must make the next state possible, and the next plan's text must start from it.
2. **What changes between two plans must be shown.** A character who was mounted and now stands on the ground, who now holds something they did not hold, who now is in another place: some plan must show the change, or the plan that needs it must show it.
3. **What is said must be possible.** Two people who talk are within earshot; someone who has not arrived does not answer; someone who left does not reappear.

## What to check, and how to fix it

Report a fault under one of these criteria (`critere`), and only if you can point at the words that break it.

| `critere` | What to look for | Smallest fix |
|---|---|---|
| `physique` | An impossible or unexplained physical state: mounted/dismounted, who holds what, who is where, an object that appears, a movement that cannot happen from the previous state, entering by a way that does not exist. | Add or move the short event that makes it possible (a sentence in the plan where it belongs), or change the state that cannot hold. |
| `temps` | The scene's `ambiance` is not held (day becomes night, the light changes, the weather changes) with no event; time jumps within a `suite`; events told out of order. | Align the description with the scene's mood, or, if the story really needs the change, make it an event of one plan (the sun sets as…) and say so in that plan. |
| `direction` | A direction that contradicts the landmarks: a train that arrives from one side and leaves towards the same side, someone who goes "towards the valley" then comes back from it, left/right swapped against the place's landmarks. | Rewrite the direction word(s) so that the same landmark means the same thing everywhere. |
| `entrees-sorties` | The order of entrances and exits: someone speaks before arriving, leaves and is still in the next plan, a group that appears in two places at once. | Move the entrance or the exit to the plan where it belongs, or change who is present. |
| `motif` | A gesture, a look, an action with no cause (a character checks a weapon "for no reason", looks round when nothing happened, walks away). | Give it its cause in one clause (what she heard, saw, remembers) **or delete the gesture**. Never leave a gesture whose only function is to fill the plan. |
| `doublon` | Two plans that accomplish the same beat (the same departure told twice, the same look, the same consequence repeated). | Keep the beat in one plan (carry over any line it held, word for word) and **cut the other** (`couper_plan`), or turn the second into a different beat if the story needs one. Fix the next plan's `liaison` if the cut changes what it follows. |
| `menace` | A threat that does not arrive clearly: it acts before anyone has seen or heard it, appears and speaks in the same breath, its number or distance changes, it is never shown to be dangerous. | Add the missing approach or first sight in one clause of the plan where it should be seen first, or split nothing: do not add plans for this. |
| `resolution` | The episode just stops: the question the episode raises (the brief's arc for this episode) gets no answer and no deliberate open ending. | Add **one** closing plan (`ajouter_plan`, after the last plan) that gives the answer or the deliberate cliffhanger the arc calls for, in the scene's own mood. |
| `dialogue` | A line that repeats what the image shows, announces what the next line will say, is empty, does not fit who says it or what they know. | Rewrite that line only. **Never touch a line that is word for word in `parolesDeLAuteur`.** |

Do **not** report: style, pacing preferences, framing, light or camera (decided later), the number of plans for its own sake, anything the author's words establish, anything that merely could be better.

## Rules for the corrections

1. **The smallest correction that makes the fault disappear.** Change the broken sentence or add one; keep everything else of the description **word for word**, including the other lines and the `État en fin de plan :` sentence when it stays true. The code compares your text to the original and sends you back if you rewrite most of it.
2. **A modified description keeps its form**: narrative, then the lines (`NOM : « … »`), then `État en fin de plan : …`, written in French, with no framing, light, sound or camera movement of your own, and no reference to another plan. Update the `État en fin de plan` if your correction changes it, and **check that the next plan still starts from it**: if not, correct the next plan too (one more correction) rather than leaving the seam.
3. **`liaison`**: when you remove or add a plan, or move an event, check the `liaison` of the plan that follows (`suite` only if it really takes up where the previous plan ends; `coupe` for another place or moment). Change it with `modifier_plan`. The first plan is always a `coupe`.
4. **Durations**: 5 to 15 s whole seconds. Cutting or adding a plan moves the total; the application checks it stays within ±20 % of the target. Compensate with `duree_plan` on a neighbour if needed.
5. **Invent nothing**: no new character, object, place or story event beyond what the fix needs. If the fix would need something the brief and the registry do not have, choose another fix. A closing plan uses people and places the episode already has.
6. **At most 8 corrections**, at most one added plan. If an episode needs more, say it in `notes` (it is to be rewritten, not proofread).
7. **Every correction has a `critere` and a one-sentence `motif`** (French) that quotes or points at the broken words. A correction with no stated reason is dropped.
8. **Each plan is corrected once per kind.** Do not modify a plan you cut.

## Order of work

1. Read the episode once for the story. 2. Read it again plan by plan with the ledger, noting every fault with its words. 3. Fill `constats` (every real fault you found, even one you decide not to fix, with its plans). 4. Fill `corrections` with the smallest fix for each fault that is worth fixing. 5. Recheck: each corrected plan still ends with `État en fin de plan :`, no handle appears in a text, durations are whole numbers from 5 to 15, no author's line was changed.

## Before you answer

- No handle, no "previous/next plan" in any `titre` or `description`.
- Each modified description is the original with a small change, ending with `État en fin de plan :`.
- No line of the author's was altered or lost; every cut plan's lines went somewhere or were empty.
- Every `liaison` after a cut, an addition or a moved event is right.
- Nothing invented beyond what the fix needs; at most 8 corrections and one added plan.
- If nothing is broken, `corrections` is an empty list and `constats` too.
