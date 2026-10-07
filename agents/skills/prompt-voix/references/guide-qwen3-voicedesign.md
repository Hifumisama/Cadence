# Qwen3-TTS VoiceDesign — writing an instruction

> Taken from the `voix-comfyui` chat skill (project practice), except what concerned temperature, seed and the stability test, which the application no longer uses. The repo workflow that creates timbres is `workflows/voice-clone/VOX_Voice-design.json` (node `Qwen3TTSEngineNode`, parameter `instruct`).

## The model

`Qwen3-TTS-12Hz-1.7B-VoiceDesign` creates a **timbre from a prose description**, with no reference audio: the character sounds like someone who does not exist. This guarantees nobody's voice is cloned. Apache-2.0 family, commercial use allowed, ten languages including French.

## The instruction (`instruct`)

**Free prose.** The more detailed, the better: `young voice` is bad, `female, 22 years old, bright and energetic tone with clear articulation` is good. One paragraph is the right length; the model prioritizes a long description instead of averaging it, so **do not ration attributes**.

**Four dimensions, in this order:**

1. **Identity**: gender, age, register (`female, 50s, deep contralto`).
2. **Origin**: **always name the character's native language** (`native French speaker`, `native Japanese speaker`), including for minor roles. It is not only an anti-accent safeguard: without it, the model interpolates between the instruction's language and the text's, and pronunciation warps (shaky liaisons, vowels pulled toward English). It anchors prosody as much as identity.
3. **Prosody**: rate, intonation, what sentence endings do.
4. **State**: the attitude, not just the sound (`amused superiority`, `entirely without warmth`).

**The instruction is in English, even when the text is French.** The text's language is a separate parameter (`language`), and the combination is native and documented. In the repo workflow, this parameter is set to `Auto`.

## What does not work, and why

1. **No negation.** `not nasal`, `no brightness` have no reliable effect. Describe what you want.
2. **No recording description.** `close-miked`, `studio reverb` describe a microphone, not a throat: it pushes toward artificial breathiness.
3. **Attributes that add up quietly.** Several words can push the same way unnoticed: `bright` + high melody + `quiet volume` give a thin voice; `slow` + `even` + `calm` give a dead voice. Reread the sum, not each word, and add the counterweight (resonance, body, melody) when it leans.
4. **Accent is a trap** when the target language is not English. Asking for a foreign accent on French text produces a dubbing caricature, not a singularity. Ask for one only if the character is *written* as foreign; otherwise, specify the targeted native pronunciation, without which the model invents one.
5. **Words that drag an accent**: `aristocratic`, `posh`, `Southern` are regional markers disguised as class markers. To aim for authority, describe the **function** (stateswoman, leader, commander).
6. **Never write "the voice of such character"**: describe qualities, not the source. An external reference almost always describes a prosody or an accent, not a timbre: translate it, and sort out what is transposable.

## Diagnostics

1. **"Flat voice"**: is the prosody described explicitly, or only implied? Does the test text's punctuation carry sentence falls? It is almost never the register at fault.
2. **"All the voices sound alike"**: the descriptions do not differentiate enough. Change one clear dimension (register, rate, state) rather than nuances, and refine **one attribute at a time**. If the user says a timbre is "weird" without details, ask which knob to move: too deep, too old, shaky accent, mechanical rate call for four different fixes.

## The two-engine pipeline

The repo workflow (`workflows/voice-clone/VOX_Voice-design.json`) chains two engines, and it is the best result obtained:

1. `Qwen3TTSEngineNode` + `UnifiedVoiceDesignerNode`: the instruction (`voice_instruction`) and a **constant English reference text** (`reference_text`, e.g. "Welcome adventurer, and be my guest…") produce the reference voice.
2. `CosyVoiceEngineNode` (Fun-CosyVoice3-0.5B-RL) + `UnifiedTTSTextNode`: the **French** line is said by cloning this reference (`opt_narrator`).

So the voice comes from the instruction; the line's language, from CosyVoice3. The `VOX_Generate_Sound_From_Characters.json` workflow takes up the second half from a reference file (`CharacterVoicesNode`: file, reference text, `trim_start` / `trim_end`), and `VOX_Doublage_voix_Audio.json` converts a recorded audio to this voice.

## The reference voice

1. **A single generation**, frozen instruction. **10 to 15 seconds** are enough; duration is measured on the audio.
2. **FLAC or WAV, never MP3**: the reference goes into a cloning model, which would copy compression artifacts.
3. **No music and no reverb**: the model copies the acoustics, not only the voice.
4. **Trim edge silences**, normalize.
5. **If the voice falls off on the lines, lengthening the reference is the first lever**, before redoing the casting: several blocks of about twelve seconds, in parallel so no block accumulates the previous one's drift, then concatenate.
