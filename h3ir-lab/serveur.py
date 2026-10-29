#!/usr/bin/env python3
"""Mini-serveur de la page d'essai Open H3 IR : lance `h3ir serve`, sert index.html et relaie /api/* vers lui.

Pourquoi un relais : `h3ir serve` ne déclare aucun CORS ; une page ouverte depuis un autre port (ou un fichier) ne peut donc pas l'appeler
depuis le navigateur. Ici la page et l'API sont sur la même origine.

Réglages : fichier .env de ce dossier (voir .env.example). Le modèle se change depuis la page : le service Open H3 IR n'accepte pas de
modèle par requête, on le relance donc avec un autre H3IR_LLM_MODEL (la liste vient de GET {H3IR_LLM_URL}/models).

Aucune dépendance propre (bibliothèque standard). Usage, depuis ce dossier, dans l'environnement où open-h3-ir est installé :
    python serveur.py                # page sur http://127.0.0.1:8421, lance h3ir sur 8420
    python serveur.py --sans-h3ir    # h3ir déjà lancé à la main (le modèle n'est alors pas modifiable depuis la page)
"""
import argparse
import http.server
import json
import os
import pathlib
import shutil
import socketserver
import subprocess
import sys
import threading
import urllib.error
import urllib.request

ICI = pathlib.Path(__file__).resolve().parent
CORPS_MAX = 600 * 1024 * 1024  # un peu plus que le plafond d'envoi d'Open H3 IR (512 Mio)


def lire_env(chemin):
    """.env minimal (CLE=valeur, # commentaires) ; ne remplace pas une variable déjà définie dans le terminal."""
    if not chemin.exists():
        return
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        cle, valeur = ligne.split("=", 1)
        os.environ.setdefault(cle.strip(), valeur.strip().strip('"').strip("'"))


class Service:
    """Le processus `h3ir serve`, relancé quand on change de modèle."""

    def __init__(self, port):
        self.port, self.proc, self.verrou = port, None, threading.Lock()

    def commande(self):
        exe = shutil.which("h3ir") or str(pathlib.Path(sys.executable).parent / ("h3ir.exe" if os.name == "nt" else "h3ir"))
        return [exe, "serve", "--host", "127.0.0.1", "--port", str(self.port)]

    def lancer(self, modele):
        with self.verrou:
            self.arreter()
            os.environ["H3IR_LLM_MODEL"] = modele
            self.proc = subprocess.Popen(self.commande(), env=os.environ.copy())

    def arreter(self):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def actif(self):
        return bool(self.proc and self.proc.poll() is None)


def modeles_disponibles():
    """Les modèles que le llama-swap annonce (GET {H3IR_LLM_URL}/models) : (liste, erreur)."""
    url = os.environ.get("H3IR_LLM_URL", "").rstrip("/")
    if not url:
        return [], "H3IR_LLM_URL n'est pas défini (voir .env)"
    requete = urllib.request.Request(url + "/models")
    if os.environ.get("H3IR_LLM_API_KEY"):
        requete.add_header("Authorization", "Bearer " + os.environ["H3IR_LLM_API_KEY"])
    try:
        with urllib.request.urlopen(requete, timeout=15) as r:
            return sorted(m["id"] for m in json.load(r).get("data", [])), None
    except Exception as e:
        return [], str(e)


class Relais(http.server.BaseHTTPRequestHandler):
    h3ir = "http://127.0.0.1:8420"
    service = None  # Service, ou None avec --sans-h3ir
    protocol_version = "HTTP/1.1"

    def _envoyer(self, statut, corps, type_contenu):
        self.send_response(statut)
        self.send_header("Content-Type", type_contenu)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _json(self, statut, objet):
        self._envoyer(statut, json.dumps(objet).encode(), "application/json")

    def _servir_page(self):
        if self.path.split("?")[0] not in ("/", "/index.html"):
            return self._envoyer(404, b"introuvable", "text/plain; charset=utf-8")
        self._envoyer(200, (ICI / "index.html").read_bytes(), "text/html; charset=utf-8")

    def _lab(self):
        """GET /lab/modeles : modèle courant + liste. POST /lab/modele {model} : relance le service avec ce modèle."""
        if self.command == "GET" and self.path == "/lab/modeles":
            liste, erreur = modeles_disponibles()
            return self._json(200, {"courant": os.environ.get("H3IR_LLM_MODEL", ""), "modeles": liste, "erreur": erreur,
                                    "url": os.environ.get("H3IR_LLM_URL", ""), "pilote": self.service is not None,
                                    "actif": self.service.actif() if self.service else None})
        if self.command == "POST" and self.path == "/lab/modele":
            corps = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if not self.service:
                return self._json(409, {"erreur": "lancé avec --sans-h3ir : relancez h3ir à la main avec un autre H3IR_LLM_MODEL"})
            modele = (json.loads(corps or b"{}").get("model") or "").strip()
            if not modele:
                return self._json(400, {"erreur": "model manquant"})
            self.service.lancer(modele)
            return self._json(200, {"courant": modele})
        self._envoyer(404, b"", "text/plain")

    def _relayer(self):
        taille = int(self.headers.get("Content-Length") or 0)
        if taille > CORPS_MAX:
            return self._envoyer(413, b"corps trop gros", "text/plain; charset=utf-8")
        corps = self.rfile.read(taille) if taille else None
        requete = urllib.request.Request(self.h3ir + self.path[len("/api"):], data=corps, method=self.command)
        if self.headers.get("Content-Type"):
            requete.add_header("Content-Type", self.headers["Content-Type"])
        try:
            with urllib.request.urlopen(requete, timeout=1800) as r:  # un brief avec modèle de langage lent peut durer
                self._envoyer(r.status, r.read(), r.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:  # 4xx/5xx d'Open H3 IR : on les transmet tels quels (le détail est lisible)
            self._envoyer(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except Exception as e:  # service arrêté, en démarrage, réseau…
            msg = ('{"detail":{"code":"relais-injoignable","message":"%s"}}' % str(e).replace('"', "'")).encode()
            self._envoyer(502, msg, "application/json")

    def _router(self):
        if self.path.startswith("/api/"):
            return self._relayer()
        if self.path.startswith("/lab/"):
            return self._lab()
        if self.command == "GET":
            return self._servir_page()
        self._envoyer(404, b"", "text/plain")

    do_GET = do_POST = do_PUT = do_PATCH = _router

    def log_message(self, fmt, *args):
        print("[h3ir-lab]", fmt % args)


class Serveur(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    lire_env(ICI / ".env")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=int(os.environ.get("H3IR_LAB_PORT", 8421)), help="port de la page")
    p.add_argument("--h3ir-port", type=int, default=int(os.environ.get("H3IR_PORT", 8420)), help="port de `h3ir serve`")
    p.add_argument("--sans-h3ir", action="store_true", help="ne pas lancer h3ir (déjà lancé à la main)")
    a = p.parse_args()
    Relais.h3ir = f"http://127.0.0.1:{a.h3ir_port}"
    if not a.sans_h3ir:
        Relais.service = Service(a.h3ir_port)
        liste, _ = modeles_disponibles()
        modele = os.environ.get("H3IR_LLM_MODEL") or (liste[0] if liste else "")
        if not modele:
            sys.exit("Aucun modèle : renseignez H3IR_LLM_URL (et H3IR_LLM_MODEL) dans h3ir-lab/.env")
        Relais.service.lancer(modele)
    print(f"[h3ir-lab] page : http://127.0.0.1:{a.port}   (relaie /api/* vers {Relais.h3ir})")
    try:
        Serveur(("127.0.0.1", a.port), Relais).serve_forever()
    finally:
        if Relais.service:
            Relais.service.arreter()
