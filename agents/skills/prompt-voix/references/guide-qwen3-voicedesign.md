# Qwen3-TTS VoiceDesign — writing an instruction

> Taken from the `voix-comfyui` chat skill (project practice), except what concerned temperature, seed and the stability test, which the application no longer uses.

## The model

`Qwen3-TTS-12Hz-1.7B-VoiceDesign` creates a **timbre from a prose description**, with no reference audio: the character sounds like someone who does not exist. This guarantees nobody's voice is cloned. Apache-2.0 family, commercial use allowed, ten languages including French.

## Rules of the instruction

- ONE paragraph in English, 35 to 80 words, in this order: who speaks (age range when known, gender, role), their native language and origin (always write 'a native <Language> speaker'), the prosody (pace, pitch, texture, energy), the emotional state.
- The voice's age is the character's, as given: with no age given, write no age figure.
- Describe what the voice IS. Never describe what it is not: no negations (no, not, never, without).
- Describe a throat, not a microphone: no 'close-miked', 'studio', 'reverb', 'recording'.
- No class or regional marker word ('posh', 'aristocratic', 'southern'): describe the function instead (commanding, gentle). An accent only for a character written as foreign.
- No names, no plot, no quotation marks.

## Why these rules

- **Detailed beats short**: `young voice` is bad, `female, 22 years old, bright and energetic tone with clear articulation` is good. The model prioritizes a long description instead of averaging it, so do not ration attributes inside the 35 to 80 words.
- **Identity** (`female, 50s, deep contralto`), **origin**, **prosody** (what sentence endings do), **state** (the attitude, not just the sound: `amused superiority`, `entirely without warmth`).
- **Native language, always named**, including for minor roles (`native French speaker`). Without it, the model interpolates between the instruction's language and the text's, and pronunciation warps (shaky liaisons, vowels pulled toward English). It anchors prosody as much as identity.
- **The instruction is in English, even when the text is French.** The text's language is a separate parameter, sent by the code as the language's English name (`French`), and the combination is native and documented.
- **Negations have no reliable effect** (`not nasal`, `no brightness`): describe what you want.
- **A recording description pushes toward artificial breathiness**: `close-miked`, `studio reverb` describe a microphone, not a throat.
- **A foreign accent on French text gives a dubbing caricature**, not a singularity. When the character is not written as foreign, name the targeted native pronunciation, without which the model invents one.
- **Class words are regional markers in disguise** (`aristocratic`, `posh`, `Southern`). To aim for authority, describe the function (stateswoman, leader, commander).
- **An external reference ("the voice of such character") almost always describes a prosody or an accent**, not a timbre: translate it into qualities and name no source.
