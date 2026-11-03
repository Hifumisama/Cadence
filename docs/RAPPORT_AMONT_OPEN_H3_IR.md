# Rapport d'amont pour `ruashots/open-h3-ir` (brouillon, version 0.4.1)

**Brouillon seulement : rien n'a été envoyé.** À relire et à poster par l'utilisateur, s'il le veut, sur le dépôt du paquet. Les références `fichier:ligne` sont celles du
paquet installé (`h3ir-lab/.venv/Lib/site-packages/h3ir/`). Contexte : Cadence compile le brief d'un plan (une intention, des images de référence, des répliques) en
prompt H3 par `POST /v1/briefs`, appelé en mémoire (`TestClient`).

## 1. Espace avant `! ? ; :` dans une réplique (typographie française)

- **Où** : `render.py:407`.
- **Constat** : une réplique française s'écrit « Merde ! Elle s'enfuit ! », avec une espace (souvent insécable, `U+00A0` ou `U+202F`) avant `!`, `?`, `;`, `:`. Telle quelle,
  la réplique casse le brouillon du compilateur (balise `<d>…</d>`).
- **Contournement côté Cadence** : les espaces `[\s  ]+` devant `! ? ; :` sont retirées avant l'envoi. La réplique n'est plus restaurée après coup.
- **Attendu** : accepter la ponctuation française telle quelle, ou documenter la normalisation attendue.

## 2. Une seule voix liée correctement quand plusieurs personnages parlent

- **Où** : `plan.py:478-498` (`voice_ref = voice_refs[0]` pour tous les locuteurs).
- **Constat** : avec deux personnages qui parlent et deux références audio `voice_timbre`, toutes les paroles prennent la première voix.
- **Contournement côté Cadence** : les images des personnages qui parlent sont envoyées en tête, dans l'ordre de parole. Insuffisant dès qu'il y a plus d'un locuteur avec voix fixée.
- **Attendu** : lier chaque locuteur à sa voix (par `speaker`, ou par l'ordre des références).

## 3. Un audio sans rôle devient une musique de fond

- **Où** : `service.py` (`_to_brief`, rôle par défaut du type : `audio → bgm`).
- **Constat** : une voix envoyée sans `role` est traitée comme une musique de fond ; une image sans rôle devient `subject` mais, avec `role_stated = False`, le mode peut
  basculer en I2VA/FL2VA (première image du clip, autre checkpoint) d'après le texte ou un appel LLM (`mode.py`).
- **Contournement côté Cadence** : tous les rôles sont déclarés (`subject`, `environment`, `storyboard`, `voice_timbre`).
- **Attendu** : une note dans la documentation de l'API qui dit que le rôle est à déclarer, ou un avertissement dans la réponse quand il est déduit.

## 4. `.env.example` du banc d'essai : `H3IR_LLM_API_KEY`

- **Constat** : le paquet lit `H3IR_LLM_KEY` (`config.py:61`) ; l'exemple d'environnement d'un projet qui l'utilise peut induire en erreur (notre `serveur.py` lisait
  `H3IR_LLM_API_KEY`). Pas un bug du paquet : à vérifier dans sa documentation que le nom est bien indiqué.

## 5. Avertissements Python à l'usage de `TestClient`

- `starlette.testclient` affiche `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` (starlette 1.10, httpx 0.28.1).
  Sans conséquence ; à savoir si `httpx2` devient obligatoire.

## 6. Mots anglais seulement pour repérer lumière, cadrage, palette, vêtements, action et interdits

- **Où** : `licence.py:209-230` (`LIGHTING_WORDS`, `FRAMING_WORDS`, `PALETTE_WORDS`, `GARMENT_WORDS`), `creativity.py` (interdits : « no music »…).
- **Constat** : une intention rédigée en français n'est pas reconnue (la référence décide alors de ces attributs, et un « sans musique » n'interdit rien).
- **Contournement côté Cadence** : l'intent est traduit en anglais par un LLM avant l'envoi (skill `traduction-intent`).
- **Attendu (suggestion)** : le dire dans la documentation de `intent`, ou l'indiquer dans un diagnostic quand l'intent n'est manifestement pas en anglais.
