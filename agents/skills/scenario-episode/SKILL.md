---
name: scenario-episode
description: Write an episode's narrative screenplay (scenes, plans, lines of dialogue) from the project brief, with plan durations that fit the brief's rhythm and target length.
metadata:
  language: instructions in English; output text in French (dialogue in the brief's dialogue language)
---

# scenario-episode — from the brief to an episode's screenplay

You write an **episode's screenplay**: its scenes, plans and lines. It is **narrative**: it says what happens and why. Framing, light, sound and assets are decided later, in each plan's video prompt (skill `plan-h3`) and in the registry.

## Output language

- **Every text field in French**: `episode.titre`, `episode.resume`, scene titles, functions and moods, plan titles and descriptions, `inventions`, `notes`.
- **Lines** (`repliques[].texte`) in the **brief's dialogue language**, word for word. Inputs are in French.
- Never change enum values or JSON keys.

## What you receive

- The **brief**: arc, style, characters (age, appearance, gestures), places, dialogue language, **target duration** and **rhythm** (`dureeEpisodeSecondes`, `rythme`), possible reference universe. `briefExtrait.notes` (project notes) apply like the rest.
- **The episode**: title, summary, and `briefEpisode`, the arc the brief gives it. `resumesEpisodesPrecedents` give narrative continuity; `resumesEpisodesSuivants` tell what this episode must prepare, without telling it.
- **`parolesDeLAuteur`** (when the project was conceived in a conversation): the author's **own messages**, in order, word for word. The brief's arc is only their summary.
- The **existing registry** (characters, places, voices): reuse its names.
- The **scope** (`portee.type`) and the user's **instruction** (`consigne`): the whole episode (`episode`), a single plan to insert (`plan-a-inserer`, with neighbouring plans) or a single plan to fix (`plan-a-corriger`). For a single plan, return ONE scene with ONE plan and write only what is asked. A `retourUtilisateur` corrects a previous proposal: apply it.

## Method

Do not ask questions: write a **complete** cut with its durations, since a wrong proposal is a starting point and a blank page is not. List separately your **inventions** (everything the brief did not say) so they can be validated or thrown out in a word. Structure first: two to four **scenes**, each with a title and a function (what the block accomplishes); then the plans, scene by scene.

## What a plan is

A plan is **one video generation call** of **5 to 15 seconds**, which may hold several internal cuts (their number follows action intensity; `plan-h3` writes them). **The goal is few plans to shoot**: each is a generation to produce, review and fix, so group rather than split.

1. **One plan = one unit of action.** Past 15 seconds you must cut, and the cut is a staging decision. A plan drifting toward 18 seconds almost always holds two.
2. **Never under 5 seconds.** A 2 or 3 second moment is not a plan: it becomes an internal cut of a neighbouring plan, or it grows to 5 s if the story justifies it.
3. **Duration follows `rythme`.** `lent`: **10–15 s**. `mesure` and `soutenu`: **8–12 s**. `rapide`: **5–8 s**, with brief moments arranged as a montage. `variable`: each scene's genre decides. No `rythme`: 8–15 s. A 5–6 s plan outside a fast rhythm is an exception (an isolated gesture, a reaction, an insert).
4. **The total stays within ±20% of `dureeEpisodeSecondes`.** Add the durations before answering; the application recounts and sends the total back if it is off. The number of plans moves the total most.
5. **Write the generated duration**, not the duration seen on screen.
6. **The description** is one or two short paragraphs: what happens, and **why the plan exists**. The intention is the only thing that later lets the video prompt turn "the first decision we see her make" into observable events. A plan without intention is empty.
7. **Each description stands alone.** No framing, light, sound or camera movement of your own (decided per cut, in the video prompt), except the author's explicit directions (see "The author's words"); no reference to another plan ("like the previous one": it goes out of sync when a plan moves; order is the array's); no asset list (name the characters, places and objects that matter, with the registry's names).

### The state of the world, plan by plan

The plans are written one after the other, each from the previous one's text alone. So **end every description with a sentence starting `État en fin de plan :`**, naming only what the next plan must find:

- **where the characters who matter are and what they face**, relative to **fixed landmarks of the place** (the fire, the door, the table, the tree), **never relative to the camera**: the camera is chosen shot by shot in the video prompt. Whoever moved in the plan has their position updated here; whoever did not move stays as they were;
- **the state of the things that changed**: a fire lit or out, a creature present or gone, an object held or dropped.

The **first plan of a place** also names its landmarks in its description ("un feu au centre, la forêt autour, Mai assise à sa gauche"), in plain words: that is where the later plans find them. Then:

1. **The next plan starts in that state** and never contradicts it (no fire back in a plan after it was put out; no character who changes sides without moving).
2. **An event happens once.** Two plans may not accomplish the same thing (the fire put out twice, the door opened twice). A plan that only repeats a consequence already shown is merged into its neighbour or dropped.
3. **The end state tells only what the description showed.** Never write a state the plan did not show (a fire "out" after a plan where it only flickered); if nothing changed for an element, say it stays as it was.
4. **A state that exists only in one plan** (a ruined set, a transformed creature) is set up by the previous plan's end state and left by its own.

### How a plan links to the one before: `liaison`

A description never refers to another plan, so **`liaison` is the plan's only link to the previous one**. Give it to every plan:

- **`suite`**: the plan takes up **where the previous one ends**: same place, same moment or a few seconds later, the same people where the previous `État en fin de plan` left them. The video prompt will open on that state.
- **`coupe`**: a **clean cut**: another place, another moment, another point of view, a reaction elsewhere. Nothing of the previous plan's end has to be reproduced.

Decide it from the story, not from the scene: a new scene is usually a `coupe`, but a scene can also cut inside itself (a cutaway, an insert) and a plan can follow another across two scenes of one action. The **first plan of the episode is a `coupe`**. When unsure, `suite`: a plan that follows on is the more common case.

## Grouping, and cutting better

**Group** several moments into one plan (the default) when they share place, time and characters and follow each other without a break, and their sum fits in 15 s with dialogue and margin. Variety of viewpoints is not a reason to split.

**Separate** on a change of place or time; a dialogue exceeding 15 s (cut at a meaning boundary); a moment needing a very different set of reference images (a plan carries six at most); a deliberate break in tone.

Where a first cut goes wrong:

1. **Over-cutting.** Consecutive 3–5 s plans in one place are almost always one 10–15 s plan. Reread each pair of consecutive plans: if they fit in 15 s without changing place or time, merge them.
2. **Static plan without intention.** If nothing changes in the image, give it an intention (a wait, a held tension: say so) or blend it into a neighbour.
3. **Static dialogue.** Cover it with internal cuts (shot/reverse shot, the listener's reaction, what the speech provokes). An exchange that fits in 15 s is ONE plan, not one per line, and a single viewpoint lacks drama.
4. **Continuity.** Think of the physical sequence of plans (exits and entrances, light that changes for no reason) without storing it.
5. **A populated place and the same place empty are two places for generation.** Say so in the description: it will be two assets.
6. **Cadence tells a character's state by contrast.** Danger is cut dense, taking control is held long. The contrast plays **inside** plans (cut density), not by multiplying short plans.

## A scene's genre, and its mood

Each scene has a **genre** that sets the cutting here and the writing guides of its plans later:

- **`action`**: a gesture or clash that must be readable; continuous action fits one plan, cut when place or stakes change. Write **what the body does** (the characters' gestures), not only the effect.
- **`dialogue`**: see "The lines".
- **`montage`**: a series of brief moments that answer each other under one idea. **Several places group into ONE plan**, one internal cut per moment (about 2 s each): four 2 s moments are one 8–10 s plan. Describe the moments in order and what links them.
- **`contemplatif`**: one place, one state, left to breathe. Few, long plans.
- **`tension`**: a build-up or tipping point. **Set it up**: an abrupt change is preceded, in the previous plan, by its first visible sign.

The **mood** (`ambiance`) is the visual frame held over the **whole scene**: time of day, weather, general light. All plans of a scene share it; it changes from one scene to the next. A change inside a scene (the sky clouding over) is an event: write it in the description of the plan where it happens.

## The lines

Lines are written here, then linked to plans:

1. **Word for word**, in the dialogue language, punctuation included. They are reused verbatim in the video prompt, never rephrased.
2. Each line has a **speaker**: a registry character, or "voix off". Never change a speaker "to make it fit".
3. A line belongs to the **plan** where it is said. A plan may carry several (shot/reverse shot); a line belongs to one plan only.
4. **Dialogue decides duration.** Pick a **generous** duration: the lines plus a margin of at least 2 s (settling the gaze before the first syllable and after the last). Do not compute it from word count; it adjusts after the voice take.
5. A line too long for 15 s: cut **at a meaning boundary**, between two lines, never mid-line; use the second plan to change angle.

## The author's words

When `parolesDeLAuteur` is present, it **outranks the summarised arc**: a precise pitch lost half of itself in the summary (the opening wide shot, the gesture of each attempt, the sounds, the thoughts, how it ends).

1. **Walk through their words beat by beat** and give **every beat** its place in a plan. Several attempts or moments that the author describes differently stay **distinct** (do not merge them into one vague "second try").
2. **What they specified about how it is seen or heard** (a wide shot then an approach, animal sounds, a gesture, closed eyes, a close-up to end on) is recorded in the plan's description as a **last sentence starting `Consigne de l'auteur :`**, close to their words. It is the one exception to rule 7 of "What a plan is": the video prompt step follows it before its own defaults.
3. **Lines.** Use the lines the author gave **word for word**. Invent a line only if a plan truly needs one they did not give, and list it in `inventions`. A story told without speech stays silent.
4. **Voice-over.** If the author wants a character's voice **off** (thoughts, no moving lips: the brief's `voix` says "voix off"), keep that character as the speaker, write the line short and in the first person, and add to the `Consigne de l'auteur` sentence that the line is voice-over (the mouth stays closed).
5. **The more precise the author, the less you invent**: say what they said. The poorer their words, the more you decide, always in `inventions`.

## What you apply from the brief

The brief's style and notes apply: you do not redefine them. Stay faithful to the brief and its author: any character or plot you add goes in `inventions`.

## Before you answer

- Every beat of `parolesDeLAuteur` has its plan; their framing, sound and voice-over directions are in a `Consigne de l'auteur :` sentence; no line is invented that they did not ask for (or it is in `inventions`).
- Every plan's description ends with `État en fin de plan :` (positions relative to landmarks, never to the camera); the first plan of a place names its landmarks; no event is done twice.
- Every plan has a description with an intention, an integer duration from 5 to 15 within the rhythm's range, and a `liaison` (`suite` or `coupe`).
- The total is within ±20% of the target.
- Every scene has a genre and a mood; montages are one plan; a tipping point is set up.
- No consecutive plans could merge into 15 s; no plan refers to another; no description holds framing, light, sound or camera.
- Every line has a speaker, an exact text and a plan, with at least 2 s of margin.
- Your additions are in `inventions`.
