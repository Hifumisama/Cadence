# H3 guide — form of each field of the draft

> Condensed from the official MiniMax H3 guide (not provided here), limited to the two task types Cadence uses: `reference generation` and `audio reference`. The rules (what to write, when) are in the rules file; this guide gives **the form of each field**.

The final prompt H3 receives has six sections (reference definitions, summary, retention analysis, detailed description, soundscape, music), all in English; only dialogue inside `<d>` and visible on-screen text keep their language. **The code assembles these six sections from your draft**: it numbers the references, places shot markers and timecodes, and writes the definition and retention lines.

## References: `nom` and `definition`

For each reference, two short English texts that the code assembles into one definition line:

- `nom`: how the plan names the asset ("Maya", "the Tenancière", "the narrow wooden corridor").
- `definition`: with no "is" or introducing verb, **the visible traits H3 must follow** (taken from the registry description: clothes, colours, materials, build, distinctive marks), then, in a few words, **a static state for this plan** ("in a torn indigo cloak, ruby eyes, breathless and dishevelled"). It stays short for a set or an effect when the name already says it.
- `retention` (optional) and `retentionNote` (one sentence: what is kept, what changes): levels in the Retention section of the rules.

## `summary`

A short English paragraph: who does what, where. It introduces no new reference and has no bracketed prefix (the code adds it). References are written `[[CODE]]`.

## `ouverture`

One to three English sentences before the first shot: the dominant light (the code puts the project's style clause in front: do not write a visual style), and, when two or more characters act together, **the sides** ("Maya is always on the left of the frame facing right, the Tenancière on the right facing left; the fight runs left to right"). Names in plain prose, no `[[CODE]]` marker.

## `shots`

One object per shot: `debutSecondes` and `texte`.

1. The first shot starts at `0` and its text is a complete sentence ("A wide shot follows [[CHAR_maya]], Maya, running…").
2. Next shots start at their entry time. **The code writes "Hard cut to" before your text**, so start directly with a **noun phrase** describing the framing ("a low-angle shot of X, …", "an extreme close-up of X, …"), then continue the sentence. A verb right after the framing ("holds on", "follows") breaks the sentence; a number, timecode, "Hard cut" or "a sudden cut to" would add to the code's.
3. **Camera**: a natural English action in the sentence (type, amplitude, speed), not a label stuck at the end: "the camera pushes in with small amplitude at slow speed toward the letter". Medium amplitude and normal speed are omitted. Motion types H3 knows: `zoom in / zoom out` (lens only, camera still), `push in / pull out` (camera moves), `pan left / right`, `truck left / right` (camera slides sideways), `tilt up / down`, `pedestal up / down` (camera rises or sinks), `arc shot` (around the subject), `tracking shot` (follows a moving subject), `static shot`, `shake slightly / strongly`, `POV`, `roll clockwise / counterclockwise`. Terms from fine-tuned H3 prompts: `swoop` (a curved flight through space, up and away or down onto the subject; seen to render), `dive` (a fast plunge toward the subject) and `whip-pan` (a very fast pan used as a transition; it can change the sides, so say who is where afterwards). The last two are less sure. Amplitude: `with small / large amplitude`; speed: `at slow / fast speed`. A camera that moves inside a shot is written in words and in time ("early in the shot the camera tracks to the right, then pushes in on the cracked floor", "smoothly reframing from the fighter to the fallen master"), with words only: no degrees, percentages or coordinates.
4. **References**: at a subject's first appearance, place in the frame and action, plus at most one identifying trait (the `definition` carries the rest); afterwards, only cite it. Every citation is written `[[CODE]]`.
5. **Speakers**: every physically produced voice gets an `(S1)`, `(S2)`… assigned once, in speaking order within the plan, without gaps (`(S1)` then `(S2)`), one number per character, reused at each turn. Several speakers at once: `(S1,S2)`. A speaking character is written `[[CHAR_x]] (Sx)`. An off-screen speaker keeps the same form, marked `off-screen`. **At a speaker's first line**, give enough to fix the voice: pitch, timbre, pace, accent ("with a low, slightly raspy voice, slow pace (S1)"); delivery and gesture stay outside `<d>`.
   - **Voice-over with no character on screen**: a stable description of the voice followed by `(Sx)`, written `says in an off-screen voiceover: <d>…</d>`.
   - **Voice-over over a character who is on screen and silent**: the same form, followed after **every** `<d>` by `while his/her lips remain completely closed`.
6. **Dialogue**: `<d>[Français] …</d>`, verbatim, punctuation included, the line is written once, in the shot where it is said; a complete sentence ends with `.`, `?` or `!` before `</d>`. An unintelligible passage is written `[unclear]`.
7. **On-screen text** (sign, label, subtitle, neon): in English double quotes, verbatim and in its own language ("a red neon sign reading "营业中"").
8. **Cut-off dialogue**: `<scenetrans>` and `<cutoff>` with the matching continuity descriptions, when a line crosses a cut or is truncated by the end of the video. The whole line stays in one `<d>`, in the shot where it begins; `<scenetrans>` sits outside the `<d>`, in **both** shots around the cut, with a sentence of continuity (the line continues seamlessly across the cut). Speech is mentioned only in the sentence that carries its `<d>`; elsewhere describe the look, the gesture, the silence.

## `overall_soundscape` and `non_diegetic_music`

1. `overall_soundscape`: **one to four sentences**, one paragraph: the background sound over the whole video (ambience, room tone, distant noises, crowd) and non-verbal human sounds. `N/A` only if complete silence is requested. Dialogue, singing and every sound tied to an action (impact, contact, footsteps, an object) stay in the `shots`. A sound reference may be cited here as `[[SFX_…]]`.
2. `non_diegetic_music`: **one to three sentences**; music only the audience hears, described by instrumentation, tempo and dynamic evolution (a low sustained cello, 60 bpm, rising slowly). `N/A` alone when there is none.
3. Both fields hold their own content: dialogue stays in the shots, and the field name is not copied into them.
