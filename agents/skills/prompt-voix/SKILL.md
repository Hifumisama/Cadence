---
name: prompt-voix
description: Write the Voice Design instruction (Qwen3-TTS) that creates a character's timbre, as the first step of voice casting; the user reviews, adjusts, then generates.
metadata:
  language: instructions in English; output language per field (see "Output language")
---

# prompt-voix — describe a voice

You prepare the **first step of a voice's casting**, in "describe the voice" mode (Voice Design): you write the **instruction** that creates the timbre. The user reviews, adjusts, then generates.

You do not act when the user **supplies audio**: there is then nothing to describe, and the reference text is what the audio says, word for word.

## Output language

- **English** (it goes to the voice model): `instruction`, `refText`.
- **French** (the user reads it): `remarques[].message`.
- Inputs (character description, brief, lines) are in French: read them, write the instruction in English.
- Never change enum values or JSON keys.

## How the voice is made here

The best observed result goes through **two engines**:

1. **Qwen3-TTS (Voice Design)** reads an **English reference text**, with your instruction, and produces the **reference voice**. The reference text is the **same for all voices** (the project's): the timbre comes from your instruction, not from the text.
2. **CosyVoice3** clones this reference and says the **lines in French**.

Consequence: **you write no reference text**. Everything rests on the instruction, and it must hold the voice when another voice takes it up in French.

## What you receive

- `voix`: the **character** attached to the voice (`personnage.code` and their `descriptionCanonique`, which carries their **age**), or, if there is none, a `role` (voice-over, narrator).
- `impressionVocaleDuBrief` and `briefExtrait`: the **brief** (tone, expected vocal impression); `langueDesDialogues` is that of the lines, said by CosyVoice3.
- `voixDejaAuCasting`: the project's **voices already cast**, with their instructions, so the new one stands apart.
- `repliquesDeLaVoix`: a few **lines**, when they exist: they tell the expected prosody (long or chopped sentences, tone).

## The principle: a memorable voice does not come from the model

The model produces a timbre. What makes a voice recognizable is **a physical constraint held without exception**, decided before the first generation and written **in the instruction itself**: "her breath is always audible before the sentence", "rate and volume rigorously constant, whatever she says", "he never finishes his sentences, the last syllable drops".

Look for this constraint in the character: if they never stop walking on screen, they never stop talking either. The rhyme with the staging is the best guide. If you find no constraint in the description, say so in `remarques` ("the character has a timbre, not yet a voice") rather than invent one.

## The instruction

`guide-qwen3-voicedesign.md` gives the form. In short:

1. **Free prose in English, one paragraph**, even when the text is French.
2. **The voice's age is the character's**, as the description says it: a teenage girl does not have a thirty-year-old's voice, a narrator is not an adult by default because they narrate. If the description gives no age, **do not choose an adult age by default**: write the instruction without an age figure and flag `description-vague` in `remarques`. The brief's adjectives ("deep", "melodious") are read through age: a young voice can be calm without being deep.
3. **Four dimensions, in this order**: identity (gender, age, register), **origin** (always name the native language: `native French speaker`), prosody (rate, intonation, what sentence endings do), state (the attitude, not just the sound).
4. **Describe what you want**, never what you refuse (no negation).
5. **Never describe a microphone or a recording**, and never cite a real person or "the voice of such character": describe qualities, not the source.

## Writing pitfalls

1. **Attributes that add up quietly.** A description can be right word by word and wrong in total (`bright` + high melody + `quiet volume` give a thin voice). Reread asking where all the words pull together, and add the counterweight (resonance, body, melody) when the sum leans.
2. **Accent is a trap** when the target language is not English: a foreign accent on French text gives a dubbing caricature. Ask for one only if the character is *written* as foreign.
3. **Words that drag an accent** (`aristocratic`, `posh`, `Southern`) are regional markers disguised as class markers. For authority, describe the **function** (stateswoman, commander) rather than birth.
4. **Distinguish it from the project's other voices.** Two characters sharing a shot/reverse-shot sequence must be told apart by ear: if their dominant trait is the same (two slow voices, two deep voices), create the gap elsewhere. It is a casting decision, not an editing one.
5. **An external reference ("like such character") almost always describes a prosody or an accent**, rarely a timbre. Translate it into qualities, without citing it.

The code checks part of these points (native language, negations, recording words, accent words). Write so they pass, without relying on it for the rest.

## The reference text: not yours

It is the project's, identical for all voices, and it must match **word for word** what the generated reference says. You do not modify it. If the user wants to depart from it (`refText`, optional in your output), write it **factual, in-universe, with no stakes**: the reference does not act, and any emotion it contains ends up stuck onto every line afterwards. Neutral does not mean dead: it must carry the character's melody.

## What you flag in `remarques`

- no physical constraint found in the character;
- a voice already cast that is too similar to this one (and which);
- an ambiguous attribute that could pull toward a flaw (thin, dead) and the counterweight added;
- a character description too vague to decide an age, register or prosody: say what is missing rather than invent it.

## What you do not do

- You do not choose the temperature, seed or sampling parameters: they stay in the workflow settings.
- You do not modify the character's description.
- You do not write to the database: your output is a proposal.

## Before you answer

- The instruction fits in one English paragraph and names the native language (the voice will say lines in that language).
- No negation, no microphone or recording word, no accent word.
- A held constraint is written in the instruction, or its absence is flagged.
- The voice stands apart from the voices already cast.
- The instruction's age is the character's; with no age in the description, none is invented and `description-vague` is flagged.
