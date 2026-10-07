<!-- variantes: sfx -->
# Stable Audio 3 — prompting a sound (`sfx` asset)

> Sources (retrieved 2026-10-01): **official** [Stability AI, `docs/guides/prompting.md`](https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md) and [ComfyUI, Stable Audio 3](https://docs.comfy.org/tutorials/audio/stable-audio/stable-audio-3); **workflow**: the rewrite template built into `workflows/audio/SFX_Generate_Sounds.json`. Rules tagged `[official]`, `[workflow]`, `[community]` or `[project]` (deduced from the graph or decided for Cadence). A `[community]` or `[project, to test]` rule is a lead, never a fact.

## The model and the workflow

- **Stable Audio 3, `medium` checkpoint**, which does music, instruments and **sounds**. Stereo output, MP3. `[official]` `[workflow]`
- **CFG 1, 8 steps**: the (empty) negative is useless, so "without X" cannot be obtained: describe what you want to hear. `[project]`
- **The prompt goes as is** (the "Enable_Reprompt" rewrite option is `false`): the agent plays the role of the small rewriting LLM, with the same rules. The docs advise the raw prompt when it is **already detailed**. `[official]`
- **Duration is a separate workflow parameter**, not text: the agent returns it in `dureeSecondes`. `[workflow]`
- **No intelligible voice**: at best unintelligible textures. Voices go through voice casting. `[official]`

## Short, but not telegraphic

**One or two dense sentences** (15 to 40 words), in English, no tag list. `[workflow]` "1 to 5 words" is advice for an older model (Stable Audio Open): three words leave everything to the seed. `[community, other model]` One prompt = **one sound or one coherent ambience**; a short ordered sequence is possible ("three impacts: metal, glass, wood, evenly spaced"). `[workflow]`

## Anatomy

Three layers, stated only if they matter. `[official]`

1. **Source**: what makes the noise, with its material (heavy wooden door, leather boots on gravel).
2. **Action**: how the sound starts and evolves (creaking open slowly, sudden crack then fading echo).
3. **Production**: space, perspective, processing (close-mic'd and dry, large reverberant stone hall, distant and muffled).

Template: `<source + material> <action / evolution>, <space / perspective>, <character>.` Vocabulary: material (wooden, metal, glass, stone, gravel, leather, fabric); character (heavy, sharp, dull, hollow, metallic, crisp, rumbling); evolution (sudden attack, slow build, long decay, fading out, steady); movement (passing by, approaching, left to right) `[workflow]`; recording (close-mic'd, dead room, tape-saturated, long reverb tail) `[official]`. Write like a **sound-library catalogue entry**. `[community, to test]`

## Duration (`dureeSecondes`)

A duration **that fits the content**: most sounds are brief. `[official]` Benchmarks `[workflow]`: impact, slam, gunshot, burst 1–3 s; medium action (steps, gesture, moved object) 3–6 s; ambience 6–15 s. **Integer.** A plan lasts 5 to 15 s: do not exceed **15 s** without a reason given in `remarques`. `[project]`

**No "Length: X seconds" in the text** (the workflow's rewrite template adds it, but nothing shows the model makes use of it on a raw prompt). `[project, to test]`

## The `TrackType: SFX` tag

The docs recommend this tag at the head of a sound prompt (more "reasonable" sounds) `[official]`; the workflow template does not use it, and it is untested on our graph. **You never write it**: if adopted, the code will add it at submission, so it can be switched off and compared. No `Genre:` or `Format:` tags: they concern music. `[project]`

## Pitfalls

1. **No negation** ("no echo" may make the echo audible): write the wanted state, "dry, close-up thump".
2. **No voice or words**, **no music** (BPM, genre, key, melodic instrument): `remarques`, type `voix-ou-musique`.
3. **No visual terms** (colour, framing, light): translate into sound (the material and weight of the noise an object makes).
4. **No technical parameters** ("48kHz", "stereo", "high quality") and no brands, artists or works. `[project, to test]`
5. **Add no sound element** absent from the canonical description (a crackling fire does not get owls as a bonus).
6. **No loop promise**: nothing guarantees an ambience loops cleanly. `[project, unverified]`
7. **Inconsistent duration**: an ambience over 2 s or a gunshot over 12 s does not render what you describe.

## Examples (prompt, duration in seconds)

| Prompt | s |
|---|---|
| Heavy wooden door creaking open slowly on a rusty hinge, long low groan, echoing hollow stone interior. | 4 |
| Campfire crackling close up, dry wood popping and soft embers hissing, faint night wind in the background. | 10 |
| Strong wind gusting over a rocky ridge, tattered cloth banners snapping and flapping, low airy rumble, open outdoor space. | 12 |
| Leather boots walking steadily on dry leaves and gravel, crisp crunching steps, close perspective. | 6 |
| Heavy plate armor clanking as a warrior kneels, metal plates sliding, then a short dull thud on packed earth. | 3 |
| Soft pillow thud landing on a stone floor, muffled fabric impact with a small puff of air, dry and close. | 1 |
| Sword drawn from a leather scabbard, bright metallic scrape ending in a clean ring, dry close perspective. | 2 |
| Ocean waves rolling onto a rocky shore, strong sea breeze, distant seagulls, wide open outdoor ambience. | 12 |
| Wooden floorboards creaking under slow footsteps in an old quiet house, sparse and tense, large reverberant room. | 6 |
| Single deep gong strike with a long metallic bloom fading slowly into silence, reverberant temple hall. | 8 |
| Glass goblet shattering on a stone floor, sharp impact followed by scattering shards. | 2 |
| Magical shimmer, rising glassy tonal sparkle with a soft airy whoosh, dissolving into faint chimes. | 4 |

## Before you answer

- English, one or two sentences, a single sound scene, at least two layers out of three (source, action, production).
- No negation, voice, music, visual term, technical parameter, tag, duration mention.
- Nothing added to the canonical description, nothing important forgotten.
- Integer `dureeSecondes`, consistent with the sound, 15 at most unless a reason is given; empty `sources`; `methode` set to `generation`.

## Uncertain

The effect of `TrackType: SFX` on our graph; the effect of a "Length" mention in a raw prompt; ambiences beyond 15 s and loop matching; "sound-library catalogue entry" (community). A third-party page's advice was not re-read at the source (Jordi Pons's page on Stable Audio Open was unreachable) and does not target this model anyway.

## Sources

- Stability AI, Stable Audio 3 prompt guide: <https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md> (mirror: <https://stability.ai/guides/stable-audio-3-prompt-guide>).
- ComfyUI, Stable Audio 3 tutorial: <https://docs.comfy.org/tutorials/audio/stable-audio/stable-audio-3>.
- "SFX" template and examples of node `52:49` of `workflows/audio/SFX_Generate_Sounds.json`.
- Jordi Pons, "On Prompting Stable Audio": <https://www.jordipons.me/on-prompting-stable-audio/> (Stable Audio Open, older model; not re-read).
