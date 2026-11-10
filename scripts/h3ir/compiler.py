"""Pont Cadence -> Open H3 IR : compile UN brief, puis s'arrête (pas de service permanent).

Lancé par le worker (lib/h3ir/compilateur.ts). Entrée sur stdin, en JSON UTF-8 : {"brief": <BriefIn>, "env": {"H3IR_...": "..."}}.
Sortie sur stdout, en JSON UTF-8 : {"http": 201, "enveloppe": {...}, "fichiers": {"<sha256>": "<chemin>"}}.
`fichiers` relie chaque entrée du manifeste (qui ne connaît que des empreintes) au chemin du fichier envoyé, donc à l'asset de Cadence.

On appelle l'application FastAPI du paquet EN MÉMOIRE (`TestClient`) : même contrat public que `POST /v1/briefs`, sans port ni démon. La
configuration du paquet est lue une seule fois par processus : les variables d'environnement sont donc posées AVANT l'import. Tout ce que le paquet
écrit sur stdout part sur stderr, pour que stdout ne porte que la réponse. Annuler = tuer ce processus : la génération s'arrête quand la
connexion vers le LLM se ferme.
"""
import contextlib
import json
import os
import sys
import traceback
import warnings


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sortie = sys.stdout
    sortie.reconfigure(encoding="utf-8")
    demande = json.load(sys.stdin)
    for cle, valeur in (demande.get("env") or {}).items():
        os.environ[cle] = str(valeur)
    warnings.filterwarnings("ignore")

    brief = demande["brief"]
    with contextlib.redirect_stdout(sys.stderr):
        try:
            from starlette.testclient import TestClient

            from h3ir.analyse import sha256_file
            from h3ir.service import app

            fichiers = {}
            for asset in brief.get("assets", []):
                chemin = asset.get("path")
                if chemin and os.path.exists(chemin):
                    fichiers[sha256_file(chemin)] = chemin
            # Le paquet n'intercepte pas ses erreurs internes : en mode « sans exception » FastAPI répond « Internal Server Error » en texte,
            # et on ne voyait plus que « JSONDecodeError » sans la cause. On laisse donc l'exception remonter pour en rendre la trace.
            reponse = TestClient(app, raise_server_exceptions=True).post("/v1/briefs", json=brief)
            resultat = {"http": reponse.status_code, "enveloppe": reponse.json(), "fichiers": fichiers}
        except Exception as erreur:  # noqa: BLE001 - tout échec est rendu au worker, qui le dit à l'utilisateur
            trace = traceback.format_exc()
            print(trace, file=sys.stderr)
            lieux = [ligne.strip() for ligne in trace.splitlines() if ligne.lstrip().startswith("File ")][-2:]
            resultat = {"http": 0, "erreur": f"{type(erreur).__name__}: {erreur}" + (f" ({' ; '.join(lieux)})" if lieux else "")}
    sortie.write(json.dumps(resultat, ensure_ascii=False))
    sortie.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
