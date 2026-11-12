---
name: scenario-scene
description: Write ONE scene of an episode (its plans, lines of dialogue, durations) from the episode's treatment, so that long films can be written scene by scene.
metadata:
  language: instructions in English; output text in French (dialogue in the brief's dialogue language)
---

# scenario-scene — from a scene's treatment to its plans

You write **one scene** of an episode: its plans and lines. It is **narrative**: it says what happens and why. Framing, light, sound and assets are decided later, in each plan's video prompt and in the registry. The other scenes are written by other calls, at the same time as yours: you do not see them, you only know the **treatment** (the list of scenes) and your scene's two neighbours.

## Output language

- **Every text field in French**: plan titles and descriptions, `inventions`, `notes`.
- **Lines** (written inside each plan's `description`) in the **brief's dialogue language**, word for word. Inputs are in French.
- Never change enum values or JSON keys.

## What you receive

- The **brief** (`briefExtrait`): style, characters (age, appearance, gestures), places, dialogue language, **rhythm** (`rythme`). `briefExtrait.notes` apply like the rest. The **episode** (title, summary, `briefEpisode`) and the **registry**: reuse its names.
- **`traitementEpisode`**: every scene of the episode, in order (title, intention). It tells you where your scene stands in the story; it is **not yours to write**.
- **`parolesDeLAuteur`**, the author's own messages word for word, and `scene.momentsDeLAuteur`, what they said about **your** scene.
- **`scene`**: your scene. `titre`, `fonction`, `ambiance` (held over the whole scene), `intention` (what it tells), `etatEntree` (where it starts), `etatSortie` (where it must end), `dureeCibleSecondes` (the screen time it has), `position` in the episode.
- **`scenePrecedente`** (title and `etatSortie`) and **`sceneSuivante`** (title and `etatEntree`), or null. Another call is writing them: trust these states.
- A `consigne` and possibly a `retourUtilisateur` that corrects a previous proposal: apply it.

## Method

Do not ask questions: write a **complete** scene, since a wrong proposal is a starting point and a blank page is not. List separately your **inventions** (everything the brief and the treatment did not say). The scene's title, function and mood are decided: you write **only its plans**, in reading order.

1. **The first plan starts in `scene.etatEntree`**; the **last plan ends in `scene.etatSortie`** (its last beat shows it). The plans in between lead from one to the other.
2. **The first plan's `liaison`**: `suite` if `etatEntree` is where the previous scene ended (same place, same moment: `scenePrecedente.etatSortie` is the same situation), `coupe` if the story cuts (another place or time), and always `coupe` when `scenePrecedente` is null. The following plans are decided from the story.
3. **Tell the scene, not its neighbours.** What `scene.intention` covers is yours; what the neighbours cover is theirs. Never repeat an event the previous scene's intention already tells.
4. A scene of **one single plan** is fine when the story is one gesture or one exchange that fits in 10 s.

## What a plan is

A plan is **one video generation call** of **4 to 10 seconds**, which may hold several internal cuts (their number follows action intensity; the video prompt step writes them). **The goal is few plans to shoot**: each is a generation to produce, review and fix, so group rather than split.

1. **One plan = one unit of action.** Past 10 seconds you must cut, and the cut is a staging decision. A plan drifting toward 12 seconds almost always holds two.
2. **Never under 4 seconds.** A 2 or 3 second moment is not a plan: it becomes an internal cut of a neighbouring plan, or it grows to 4 s if the story justifies it.
3. **Duration follows `rythme`.** `lent`: **8–10 s**. `mesure` and `soutenu`: **6–9 s**. `rapide`: **5–7 s**, with brief moments arranged as a montage. `variable`: what each moment holds decides (a held, calm moment long; a clash or a montage shorter). No `rythme`: 6–10 s. A 5–6 s plan outside a fast rhythm is an exception (an isolated gesture, a reaction, an insert).
4. **The scene's total follows `scene.dureeCibleSecondes`.** Choose the number of plans and their relative lengths so that the sum comes close to it; the application then adjusts the durations to hit it exactly, so never spend effort on the arithmetic. A scene of 40 s is about five plans at a measured rhythm.
5. **Write the generated duration**, not the duration seen on screen.
6. **The description** is the plan's **intent**: what happens, **why the plan exists** and, if someone speaks, **the lines** (see "The lines"). It is the only text the video prompt step reads to turn "the first decision we see her make" into observable events, so write it precise and complete (see "What a description holds"). A plan without intention is empty.
7. **Each description stands alone.** No framing, sound or camera movement of your own (decided per cut, in the video prompt), except the author's explicit directions (see "The author's words"); light only when it changes during the plan (see below); no reference to another plan ("like the previous one": it goes out of sync when a plan moves; order is the array's); no asset list (name the characters, places and objects that matter, with the registry's names).

### What a description holds

Write it in plain, observable French, in this order, in about three to six sentences of narrative:

1. **The start, only when the plan opens a moment of its own.** Write it for the **first plan of a scene** and for every plan whose `liaison` is `coupe`: where the characters who matter are, what they face and what they hold, relative to **fixed landmarks of the place** (the fire, the door, the table, the tree), **never relative to the camera**: the camera is chosen shot by shot in the video prompt. The **first plan of a place** names its landmarks in plain words ("un feu au centre, la forêt autour, Mai assise à sa gauche"); later plans find them there. **A plan whose `liaison` is `suite` has no start paragraph**: the video of the previous plan carries over into it (same place, same positions, same light), so begin straight on the first beat. Restating the positions would only repeat the previous plan's last beat.
2. **The beats, in order.** What each character present does, with visible verbs (she kneels, he steps back, the flames catch), what causes what, and where each line falls among the gestures. Whoever moves says where to (toward the door, around the fire). The listener of a line reacts.
3. **What changes during the plan.** The state of the things that matter (a fire lit or dying, an object picked up or dropped, a creature arriving or leaving), and the light **only when it changes as an event** (a lamp going out, the flames rising and lighting the faces). The scene's mood (`ambiance`) is held over the whole scene and given apart: do not restate it.
4. **The end.** The last beat, as the image shows it in the final second: who is where, doing what. It is what the next plan starts from, so make it precise; before a `suite`, it is a movement in progress (rule 5 below).
5. **Why it matters, and its tone**, in a short clause: what the plan tells or makes felt (a held wait, a first doubt, a small triumph), through a visible sign, never as an abstract feeling alone ("elle se sent seule" shows nothing; "elle serre ses genoux contre elle, seule devant les braises" does).
6. **The lines**, if anyone speaks, after the narrative, one per line (see "The lines").

Say each thing once: no beat told twice, no closing sentence that sums up what the beats already said, no appearance the registry or the brief already gives (name the characters by their registry names), no `État en fin de plan :` line (it no longer exists: the end is told by the last beat).

### The state of the world, plan by plan

The plans are written one after the other, each from the previous one's text alone: the next plan learns where this one ends from its last beat. So:

1. **The next plan starts where this one ends** and never contradicts it (no fire back in a plan after it was put out; no character who changes sides without moving). Whoever did not move stays where they were.
2. **An event happens once.** Two plans may not accomplish the same thing (the fire put out twice, the door opened twice). A plan that only repeats a consequence already shown is merged into its neighbour or dropped.
3. **Tell only what the plan shows.** Never leave a state the plan did not show (a fire "out" after a plan where it only flickered).
4. **A state that exists only in one plan** (a ruined set, a transformed creature) is set up by the end of the previous plan and left by its own.
5. **Before a `suite`, the plan ends in a movement in progress.** A `suite` plan is rendered as the continuation of the previous one, from its last frames and sound, without a cut. So decide each plan's `liaison` first, then write the last beat of a plan before a `suite` **in the middle of a gesture**: a character mid-leap, a foot in mid-step, an arm swinging, a body sliding back, a dodge half-turned, a fist drawn back. Not at rest (« debout, immobile », « face à face », « reprend son souffle »): a plan that ends at rest gives the next one nothing to continue, and a duel plays flat. Stop the description **before** the movement is resolved (`Pika bondit en arrière, les deux pistolets balancés, à mi-saut ; Soom se lance à sa poursuite, la jambe levée.`). **One readable gesture, the body clear**: not a whirl, a blur or a flurry of blows. The next plan then opens by finishing the movement. The end holds still only before a `coupe`, for the last plan of the episode, or when the story needs a held ending (a victory, a silence).

### How a plan links to the one before: `liaison`

A description never refers to another plan, so **`liaison` is the plan's only link to the previous one**. Give it to every plan:

- **`suite`**: the plan takes up **where the previous one ends**: same place, same moment or a few seconds later, the same people where the previous plan's last beat left them. Its render continues the previous one without a cut.
- **`coupe`**: a **clean cut**: another place, another moment, another point of view, a reaction elsewhere. Nothing of the previous plan's end has to be reproduced.

Decide it from the story, not from the scene: a new scene is usually a `coupe`, but a scene can also cut inside itself (a cutaway, an insert) and a plan can follow another across two scenes of one action. The **first plan of the episode is a `coupe`**. When unsure, `coupe`. `suite` is the exception and needs a reason: one continuous action in the same framing that runs past the 10-second limit of a plan (a movement, a fall, a long take cut for length). A shot/reverse shot, a change of angle, a cutaway or a new moment is a `coupe`, even inside one scene: only a `suite` is rendered as the continuation of the previous plan, and a chain of `suite` plans forces every following plan to be rendered again when one changes.

## Grouping, and cutting better

**Group** several moments into one plan (the default) when they share place, time and characters and follow each other without a break, and their sum fits in 10 s with dialogue and margin. Variety of viewpoints is not a reason to split.

**Separate** on a change of place or time; a dialogue exceeding 10 s (cut at a meaning boundary); a moment needing a very different set of reference images (a plan carries six at most); a deliberate break in tone.

Where a first cut goes wrong:

1. **Over-cutting.** Consecutive 3–5 s plans in one place are almost always one 8–10 s plan. Reread each pair of consecutive plans: if they fit in 10 s without changing place or time, merge them.
2. **Static plan without intention.** If nothing changes in the image, give it an intention (a wait, a held tension: say so) or blend it into a neighbour.
3. **Static dialogue.** Cover it with internal cuts (shot/reverse shot, the listener's reaction, what the speech provokes). An exchange that fits in 10 s is ONE plan, not one per line, and a single viewpoint lacks drama.
4. **Continuity.** Think of the physical sequence of plans (exits and entrances, light that changes for no reason) without storing it.
5. **A populated place and the same place empty are two places for generation.** Say so in the description: it will be two assets.
6. **Cadence tells a character's state by contrast.** Danger is cut dense, taking control is held long. The contrast plays **inside** plans (cut density), not by multiplying short plans.

## Kinds of moments, and the scene's mood

How a moment is cut follows what it holds; a scene may hold several kinds:

- **A clash or a physical action**: a gesture or clash that must be readable; continuous action fits one plan, cut when place or stakes change. Write **what the body does** (the characters' gestures), not only the effect. For each beat of a clash:
  - **Every character present acts.** Nobody stays still while the other acts: each has a verb of action or a physical reaction that follows from what the other did (dodges, gives ground, parries, counters, braces). A calm character is calm in manner, not motionless; a movement never happens on the spot without purpose (nobody « tourne sur elle-même » for nothing: each turn dodges, aims or builds a strike).
  - **Strong actions have a scale when the style is stylised.** If the brief's style clause is graphic (manga, cel, cartoon, comic, anime), the finisher is exaggerated and its scale is part of the story, so say it: how high a character leaps and that he hangs there, how wide the crater is, how far a body is thrown. A realistic style is not exaggerated.
  - **Solid limits stop bodies.** A thrown or pushed character stops against the ropes, a wall, a post (the landmarks of the place); never write that they cross one, unless it breaks.
  - **A beat is told once inside a plan** (a blow, a fall, a dodge); a second moment of the plan brings a new fact.
- **Characters talking**: see "The lines".
- **A series of brief moments** that answer each other under one idea (a montage). **Several places group into ONE plan**, one internal cut per moment (about 2 s each): four 2 s moments are one 8–10 s plan. Describe the moments in order and what links them.
- **A place left to breathe**: one place, one state. Few, long plans.
- **A build-up or a tipping point**. **Set it up**: an abrupt change is preceded, in the previous plan, by its first visible sign.

The **mood** (`ambiance`) is the visual frame held over the **whole scene**: time of day, weather, general light. All plans of a scene share it; it changes from one scene to the next. A change inside a scene (the sky clouding over) is an event: write it in the description of the plan where it happens.

## The lines

A line lives **in the plan's description and nowhere else**: the video prompt step reads it there and writes it into the shot. There is no separate list of lines.

1. **Write each line as `NAME : « text »`**, one per line of the description, in speaking order, after the narrative. `NAME` is a registry character's name, or `voix off`. Never change a speaker "to make it fit".
2. **Word for word**, in the dialogue language, punctuation included: the lines are reused verbatim in the video prompt, never rephrased.
3. A line belongs to **one plan** only. A plan may carry several (shot/reverse shot); an exchange that fits in 10 s is one plan.
4. **Dialogue decides duration.** Pick a **generous** duration: the lines plus a margin of at least 2 s (settling the gaze before the first syllable and after the last). Do not compute it from word count.
5. A line too long for 10 s: cut **at a meaning boundary**, between two lines, never mid-line; use the second plan to change angle.
6. At most **three characters speak in one plan** (each needs a voice reference); split the plan at a meaning boundary beyond that.

## The author's words

When `parolesDeLAuteur` is present, it **outranks the summarised arc**: a precise pitch lost half of itself in the summary (the opening wide shot, the gesture of each attempt, the sounds, the thoughts, how it ends).

1. **Walk through the words that belong to THIS scene** (`scene.momentsDeLAuteur`, and in `parolesDeLAuteur` whatever the scene's intention covers) beat by beat and give **every beat** its place in a plan. Beats of other scenes are theirs to write, not yours. Several attempts or moments that the author describes differently stay **distinct** (do not merge them into one vague "second try").
2. **What they specified about how it is seen or heard** (a wide shot then an approach, animal sounds, a gesture, closed eyes, a close-up to end on) is recorded in the plan's description as a **last sentence starting `Consigne de l'auteur :`**, close to their words. It is the one exception to rule 7 of "What a plan is": the video prompt step follows it before its own defaults.
3. **Lines.** Use the lines the author gave **word for word**. Invent a line only if a plan truly needs one they did not give, and list it in `inventions`. A story told without speech stays silent.
4. **Voice-over.** If the author wants a character's voice **off** (thoughts, no moving lips: the brief's `voix` says "voix off"), keep that character as the speaker, write the line short and in the first person, and add to the `Consigne de l'auteur` sentence that the line is voice-over (the mouth stays closed).
5. **The more precise the author, the less you invent**: say what they said. The poorer their words, the more you decide, always in `inventions`.

## What you apply from the brief

The brief's style and notes apply: you do not redefine them. Stay faithful to the brief, the treatment and the author: any character or plot you add goes in `inventions`.

## Before you answer

- The first plan starts in `etatEntree` and its `liaison` fits the previous scene; the last plan ends in `etatSortie`.
- Every beat of `scene.momentsDeLAuteur` has its plan; framing, sound and voice-over directions are in a `Consigne de l'auteur :` sentence; no line is invented that they did not ask for (or it is in `inventions`).
- Every description is a precise intent: the start only on the first plan of a scene or after a `coupe` (positions relative to landmarks, never to the camera; none after a `suite`), the beats in order, what changes, the end as its last beat, why it matters; no `État en fin de plan :` line; no event is done twice.
- Every plan followed by a `suite` ends in a movement in progress (one sharp gesture), not at rest; in a clash, every character acts in each beat, strong actions carry their scale in a stylised style, and nothing crosses a solid limit.
- Every plan has a description with an intention, an integer duration from 4 to 10 within the rhythm's range, and a `liaison` (`suite` or `coupe`).
- The scene's total is close to `dureeCibleSecondes`; montages are one plan; a tipping point is set up.
- No consecutive plans could merge into 10 s; no plan refers to another; no description holds framing, light, sound or camera.
- Every line is in its plan's description as `NAME : « text »`, exact, after the narrative, with at least 2 s of margin; at most three speakers per plan.
- Your additions are in `inventions`.
