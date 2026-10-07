---
name: scenario-episode
description: Write an episode's narrative screenplay (scenes, plans, lines of dialogue) from the project brief, with plan durations that fit the brief's rhythm and target length.
metadata:
  language: instructions in English; output text in French (dialogue in the brief's dialogue language)
---

# scenario-episode — from the brief to an episode's screenplay

You write an **episode's screenplay**: its scenes, plans and lines. It is a **narrative** screenplay: it says what happens and why. It says nothing about framing, light, sound or assets: those decisions are made later, in each plan's video prompt (skill `plan-h3`) and in the registry.

## Output language

- **Write every text field in French**: `episode.titre`, `episode.resume`, scene titles, functions and moods, plan titles and descriptions, `inventions`, `notes`.
- **Lines of dialogue** (`repliques[].texte`) are written in the **dialogue language of the brief**, word for word.
- Inputs (brief, registry, instruction) are in French.
- Never change enum values or JSON keys.

## What you receive

- The **brief**: arc, style, characters (with age, appearance, gestures), places, continuity rules, rhymes, progressions, pitfalls, dialogue language, **target duration** and **rhythm** (`dureeEpisodeSecondes`, `rythme`), possible reference universe.
- **The episode**: its title and summary (from the brief), and `briefEpisode`, the arc the brief gives it.
- The **summaries of previous episodes** (`resumesEpisodesPrecedents`) for narrative continuity, and the **titles and summaries of following episodes** (`resumesEpisodesSuivants`) to know what this episode must prepare without telling it (visual continuity is held at episode scale, not series scale).
- The **project notes** (`briefExtrait.notes`) when the user left some: they apply like the rest of the brief.
- The **existing registry** (characters, places, voices), to use names that already exist.
- The requested **scope** (`portee.type`) and the user's **instruction** (`consigne`: add a plan, complete what is empty, redo…): the whole episode (`episode`), a single plan to insert (`plan-a-inserer`, with neighbouring plans) or a single plan to fix (`plan-a-corriger`). For a single plan, you return ONE scene containing ONE plan, and write only what is asked. A possible `retourUtilisateur` corrects a previous proposal: take it into account.

## The method: propose a complete cut

Do not ask questions before proposing. Write a **complete** cut, with its durations: a wrong proposal is a starting point, a blank page is not. Then list your **inventions** separately (everything the brief did not say), so they can be validated or thrown out in a word.

Structure first: two to four **scenes**, each with a title and its function in the episode (what the block accomplishes). Then the plans, scene by scene.

## What a plan is

A plan is **one video generation call**: a whole duration of **5 to 15 seconds**. It may contain several internal cuts, whose number follows action intensity (see below): writing them is not your job, but you must take them into account when deciding what fits in a plan.

**The goal is to have few plans to shoot.** Each plan is a generation to produce, review and fix: the fewer, the better. Do not be afraid to **group** several moments into one plan.

1. **One plan = one unit of action.** Beyond 15 seconds you must cut, and a cut is a staging decision, not a stopgap. If a plan drifts toward 18 seconds, it almost always contains two.
2. **Never under 5 seconds.** A moment lasting only 2 or 3 seconds is not a plan: it slips into the neighbouring plan as an internal cut (which `plan-h3` will write), or it develops up to 5 seconds if the story justifies it. A duration of 4 seconds or less is an error.
3. **Duration follows the brief's rhythm** (`rythme`) and the scene's genre. `lent`: long plans, **10 to 15 s**. `mesure` and `soutenu`: **8 to 12 s**. `rapide`: **5 to 8 s**, and sequences of brief moments are arranged as a montage (see below). `variable`: each scene's genre decides. Without `rythme`, aim for 8 to 15 s. A 5–6 second plan outside a fast rhythm stays the exception: an isolated gesture, a reaction, an insert that cannot blend elsewhere.
4. **Total duration holds the target.** Add up all plans' durations before answering: the total must stay within **±20%** of `dureeEpisodeSecondes`. Beyond that, the application will flag it: adjust the number of plans or their duration (the number of plans changes the total most).
5. **Write the duration that will be generated**, not the duration seen on screen: a plan "seen" for 3 seconds blends into another, it is not written as 3.
6. **The description** is narrative text: what happens, and why the plan exists. One or two short paragraphs. "Why" matters: it is the only thing that will later allow translating the intention into observable events ("the first decision we see her make" becomes "her walk stops, her head turns"). A plan without intention is an empty plan.
7. **No framing, light, sound or camera movement** in the description: they are decided per cut in the video prompt, nowhere else.
8. **No reference to another plan** ("like the previous plan", "answering plan 4"): such mentions go out of sync as soon as a plan is inserted or moved. Each description is understood alone. Order is that of the array you return; there is no plan number.
9. **No asset list.** Story first. Name the characters, places and objects that matter in the description, with the registry's names when they exist; the registry will be deduced afterwards.

## Grouping, and cutting better

**When to group several moments into one plan** (the default): they happen in the same place, at the same time, with the same characters, and follow each other with no break in action or time. Their sum fits in 15 seconds, dialogue and margin included. Variety of viewpoints is not a reason to separate: a plan may contain several internal cuts, which `plan-h3` will write.

**When to separate**: change of place or time; a dialogue that would exceed 15 seconds (cut at a meaning boundary); a moment that demands a very different set of reference images (a plan carries only a few subjects, six reference images at most: do not merge moments that would need many more); a deliberate break in tone.

Production feedback says where a first cut goes wrong. Apply it from the writing stage:

1. **Over-cutting.** A sequence of 3 to 5 second plans in the same place is almost always a single 10 to 15 second plan, with internal cuts. Before answering, reread each pair of consecutive plans: if they fit together in 15 seconds without changing place or time, merge them.
2. **Static plan without intention.** If nothing changes in the image during the whole plan, either it needs an intention (a wait, a held tension: say so), or the moment must blend into a neighbouring plan.
3. **Dialogue scene too static.** Cover it with internal cuts: shot/reverse shot, the listener's reaction, a cut to what the speech provokes. If the exchange fits in 15 seconds, it is ONE plan, not one plan per line. A dialogue filmed from a single viewpoint lacks drama.
4. **Continuity logic.** A character entering from the right after moving left, a light changing for no reason: think of the physical sequence of plans, without storing it.
5. **A populated place and the same place empty are two places for generation.** If the scene goes from a crowd to an empty spot, say so in the description: it will be two assets.
6. **Cadence tells the character's state by contrast.** A character in danger is cut into plans dense with internal cuts, one who takes control is held in a long slow plan. The contrast plays out **inside** the plans (cut density), not by multiplying short plans.

## A scene's genre, and its mood

Each scene has a **genre** (`action`, `dialogue`, `montage`, `contemplatif`, `tension`) and a **mood** (`ambiance`). The genre sets the cutting here and later chooses the writing guides for the scene's plans.

1. **`action`**: a gesture or a clash that must be readable. A continuous action moment fits in one plan; cut when the place or the stakes change. Write in the description **what the body does** (the brief characters' gestures: how they fight, work, move), not only the resulting effect.
2. **`dialogue`**: see "The lines"; an exchange that fits in 15 s is ONE plan.
3. **`montage`**: a **series of brief moments** that answer each other under one idea (different places, characters or gestures, chained quickly). This is the case where **several places group into a single plan**, with one internal cut per moment (about 2 s each, `plan-h3` will write the cuts): four 2 s moments are ONE plan of 8 to 10 s, not four 10 s plans. Say in the description the moments, in order, and what links them.
4. **`contemplatif`**: one place, one state, left to breathe. Few, long plans, nothing rushes.
5. **`tension`**: a build-up or a tipping point. **It is set up**: an abrupt change (a threat, a break) is preceded, in the previous plan, by its first visible sign; without it the tipping plan seems to fall from the sky.

The **mood** is the visual frame held over the **whole scene**: time of day, weather, general light ("full daylight, clear sky", "night, light rain"). All of a scene's plans share it; it changes **from one scene to the next**, never at random within a plan. A mood change inside a scene (the sky clouding over) is an event: write it in the description of the plan where it happens.

## Camera is expensive

Each compound movement (orbit, multiple movement, speed change mid-plan) is a source of generation failure. Write the intention of the simplest one that produces the wanted effect.

## The lines

Lines are **entities in their own right**, written here then linked to plans (to the plan sheet):

1. Write each line **word for word**, in the brief's dialogue language, punctuation included. It will be reused verbatim in the video prompt, never rephrased.
2. Each line has a **speaker**: a registry character, or a voice-over / narrator if no character speaks. Do not change a line's speaker to "make it fit".
3. A line is attached to the **plan** where it is said. A plan may carry several (shot/reverse shot); one line may cover two plans if it crosses a cut.
4. **Dialogue decides duration.** A dialogue plan needs its lines' duration plus a breathing margin of at least 2 seconds (time to settle the gaze before the first syllable and after the last). You do not know the real duration before the voice take: pick a **generous** duration, and do not try to compute it from the word count. It will adjust after the voice.
5. If a line is clearly too long for a 15 second plan, cut the plan **at a meaning boundary**: between two lines, never mid-line. Use the second plan to change angle (the listener's reaction, for example).

## What you apply from the brief

1. **The brief's style, continuity rules, rhymes, progressions and pitfalls** apply: you do not redefine them. A declared rhyme is translated in the description of each of the two plans ("the close-up on Maya's eyes, which takes up the opening's motif" is not a reference: it is the motif itself, written without citing the other plan).
2. **Stay faithful to the brief and the author.** Add no character or plot absent from the brief without listing them in `inventions`.

## Before you answer

- Every plan has a non-empty description containing an intention.
- All durations are integers from **5 to 15**, within the brief's rhythm range. No plan of 4 seconds or less.
- The total of durations is within ±20% of the brief's target duration.
- Every scene has a genre and a mood; a montage of brief moments is one plan, not one plan per moment; a tipping point is set up by the plan before it.
- No pair of consecutive plans could merge into 15 seconds (same place, same time, same characters): otherwise, merge them.
- No plan refers to another plan, and no description contains framing, light, sound or camera movement.
- Every line has a speaker, an exact text, and is attached to a plan.
- A dialogue plan leaves at least 2 s of margin on its lines; if it overflows, it is cut at a meaning boundary.
- A dialogue scene is not filmed from a single viewpoint.
- The brief's declared rhymes are translated in the two plans concerned.
- Your additions to the brief are listed in `inventions`.
