// La scène de blockout : traduit les énumérations d'un plan (plan.schema.json) en géométrie, et rend l'image numéro i.
// Tout est fonction de l'indice d'image : pas d'horloge, pas de hasard. Mêmes JSON → mêmes images.
import * as THREE from "three";

const RAD = Math.PI / 180;

// ── Ce que chaque valeur du schéma désigne ──────────────────────────────────────────────────────────────────────────
const PAS = 1.5; // mètres entre deux cases de la grille
const COLONNES = { hors_gauche: -3 * PAS, gauche: -PAS, centre: 0, droite: PAS, hors_droite: 3 * PAS }; // x
const SUR_LA_GRILLE = ["gauche", "centre", "droite"]; // les colonnes hors_* servent aux entrées et sorties de champ
const MOMENTS = { tout_le_plan: [0, 1], premiere_moitie: [0, 0.5], seconde_moitie: [0.5, 1] }; // fenêtre d'un déplacement
const PROFONDEURS = { avant: PAS, milieu: 0, fond: -PAS }; // z (la caméra « face » est du côté des z positifs)
const ORIENTATIONS = { vers_avant: 0, vers_droite: 90, vers_fond: 180, vers_gauche: -90 }; // degrés autour de la verticale
const GABARITS = { petit: 0.6, moyen: 1, grand: 1.4 };
const FORMES = { capsule: { largeur: 0.5, hauteur: 1.7 }, boite: { largeur: 0.9, hauteur: 0.9 }, sphere: { largeur: 0.7, hauteur: 0.7 } };

/** Taille de plan : hauteur du cadre et hauteur visée, en fractions de la hauteur H de la cible. */
const CADRAGES = {
  extreme_wide: { h: 4.5, cy: 0.9 },
  wide: { h: 2.6, cy: 0.65 },
  full: { h: 1.25, cy: 0.5 },
  medium: { h: 0.75, cy: 0.72 },
  medium_close_up: { h: 0.45, cy: 0.82 },
  close_up: { h: 0.26, cy: 0.9 },
};
const ANGLES = { eye_level: 0, low_angle: -20, high_angle: 25, bird_eye: 60 }; // élévation de la caméra, degrés
const AXES = { face: 0, trois_quarts_gauche: -45, trois_quarts_droit: 45, profil_gauche: -90, profil_droit: 90, dos: 180 }; // azimut, degrés
const FOCALE = 35; // champ vertical, degrés
const MARGE_GROUPE = 1.0; // mètres ajoutés à la largeur d'un groupe pour qu'il tienne dans le cadre
const HAUTEUR_MIN_CAMERA = 0.2; // la caméra ne passe jamais sous le sol

/** Amplitudes, par famille de mouvement. */
const AMPLITUDES = {
  resserrement: { small: 0.2, medium: 0.4, large: 0.65 }, // part du cadre gagnée (push, zoom)
  panoramique: { small: 10, medium: 25, large: 50 }, // degrés (pan)
  bascule: { small: 8, medium: 18, large: 35 }, // degrés (tilt)
  lateral: { small: 0.25, medium: 0.6, large: 1.2 }, // largeurs de cadre (truck)
  vertical: { small: 0.2, medium: 0.5, large: 1.0 }, // hauteurs de cadre (pedestal)
  arc: { small: 30, medium: 60, large: 120 }, // degrés autour de la cible
  roulis: { small: 8, medium: 20, large: 45 }, // degrés
  tremblement: { small: 0.4, medium: 0.9, large: 2.0 }, // degrés
};
/** Vitesse : la fenêtre du plan (début, durée, en fractions) pendant laquelle le mouvement a lieu. */
const VITESSES = { slow: [0, 1], normal: [0.2, 0.6], fast: [0.35, 0.3] };
const FREQUENCES_TREMBLEMENT = { slow: 1.5, normal: 3, fast: 6 }; // Hz

// ── Sujets ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const caseVers = (c) => new THREE.Vector3(COLONNES[c.colonne], 0, PROFONDEURS[c.profondeur]);

function decrireSujet(sujet) {
  const k = GABARITS[sujet.gabarit ?? "moyen"];
  const depart = caseVers(sujet.placement);
  const arrivee = sujet.deplacement ? caseVers(sujet.deplacement.vers) : depart.clone();
  let lacet = ORIENTATIONS[sujet.orientation ?? "vers_avant"] * RAD;
  if (!sujet.orientation && sujet.deplacement) lacet = Math.atan2(arrivee.x - depart.x, arrivee.z - depart.z);
  return {
    id: sujet.id, depart, arrivee, lacet,
    moment: MOMENTS[sujet.deplacement?.moment ?? "tout_le_plan"],
    surLaGrille: SUR_LA_GRILLE.includes(sujet.placement.colonne),
    largeur: FORMES[sujet.forme].largeur * k, hauteur: FORMES[sujet.forme].hauteur * k,
  };
}

const borner = (x) => Math.min(1, Math.max(0, x));

/** Position d'un sujet à l'avancement u du plan (0 → 1) : ligne droite, vitesse constante, pendant la fenêtre de son déplacement. */
const positionSujet = (d, u) => d.depart.clone().lerp(d.arrivee, borner((u - d.moment[0]) / (d.moment[1] - d.moment[0])));

const GRIS = [0xdcdcdc, 0xb4b4b4, 0xc8c8c8, 0xa4a4a4, 0xd0d0d0];

function construireSujet(sujet, d, rang, avecEtiquette) {
  const groupe = new THREE.Group();
  const matiere = new THREE.MeshLambertMaterial({ color: GRIS[rang % GRIS.length] });
  const { largeur: l, hauteur: h } = d;
  let geometrie;
  if (sujet.forme === "capsule") geometrie = new THREE.CapsuleGeometry(l / 2, h - l, 8, 24);
  else if (sujet.forme === "sphere") geometrie = new THREE.SphereGeometry(l / 2, 32, 16);
  else geometrie = new THREE.BoxGeometry(l, h, l);
  const corps = new THREE.Mesh(geometrie, matiere);
  corps.position.y = h / 2;
  groupe.add(corps);

  // Repère de face : une petite barre sombre à hauteur de « regard », du côté où le sujet est tourné.
  const repere = new THREE.Mesh(new THREE.BoxGeometry(l * 0.45, h * 0.06, l * 0.25), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
  repere.position.set(0, sujet.forme === "capsule" ? h * 0.87 : h * 0.6, l / 2);
  groupe.add(repere);

  if (avecEtiquette) {
    const toile = document.createElement("canvas");
    toile.width = 512;
    toile.height = 128;
    const c = toile.getContext("2d");
    c.fillStyle = "#1e1e1e";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#ffffff";
    c.font = "bold 72px Arial, Helvetica, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(sujet.etiquette, 256, 68, 480);
    const texture = new THREE.CanvasTexture(toile);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Sur le corps (aux deux tiers de la hauteur) : au-dessus de la tête, elle sortait du cadre dès le plan en pied.
    // `image()` la tient à chaque image du côté de la caméra, juste devant le volume.
    const etiquette = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
    groupe.userData.etiquette = etiquette;
    const largeurEtiquette = Math.max(0.44, l * 0.9);
    etiquette.scale.set(largeurEtiquette, largeurEtiquette / 4, 1);
    etiquette.position.y = h * 0.66;
    groupe.add(etiquette);
  }
  groupe.rotation.y = d.lacet;
  return groupe;
}

// ── Caméra ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const lisse = (x) => x * x * (3 - 2 * x);
function avancement(u, vitesse) {
  const [debut, duree] = VITESSES[vitesse];
  return lisse(Math.min(1, Math.max(0, (u - debut) / duree)));
}

/** L'état de la caméra à l'image i sur n : position, point visé, champ, roulis. Fonction pure du plan.
 * Les mouvements (camera, puis camera.puis) se partagent le plan en parts égales ; chacun repart de l'état laissé par le précédent. */
export function etatCamera(plan, descriptions, i, n) {
  const u = n > 1 ? i / (n - 1) : 0;
  const t = i / plan.cadence;
  const [largeurImage, hauteurImage] = plan.resolution.split("x").map(Number);
  const aspect = largeurImage / hauteurImage;

  let azimut = AXES[plan.cadre.axe] * RAD;
  const elevation = ANGLES[plan.cadre.angle] * RAD;
  const droiteDe = (az) => new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));

  // La cible : un sujet, ou le groupe (les sujets partis de la grille : centre de leurs positions de départ, largeur vue depuis l'axe de départ).
  const vises = plan.cadre.cible === "groupe" ? descriptions.filter((d) => d.surLaGrille) : descriptions.filter((d) => d.id === plan.cadre.cible);
  const H = Math.max(...vises.map((d) => d.hauteur));
  const boite = new THREE.Box3().setFromPoints(vises.map((d) => d.depart));
  const centre = boite.getCenter(new THREE.Vector3());
  const abscisses = vises.map((d) => d.depart.dot(droiteDe(azimut)));
  const largeurGroupe = vises.length > 1 ? Math.max(...abscisses) - Math.min(...abscisses) : 0;
  const cadrage = (taille) => ({
    h: Math.max(CADRAGES[taille].h * H, vises.length > 1 ? (largeurGroupe + MARGE_GROUPE) / aspect : 0),
    cy: CADRAGES[taille].cy * H,
  });

  const depart = cadrage(plan.cadre.taille);
  let hCadre = depart.h; // hauteur du cadre au point visé
  let champ = FOCALE;
  let distance = hCadre / (2 * Math.tan((champ * RAD) / 2));
  let hauteurVisee = depart.cy;
  let lacet = 0; // pan : la visée pivote, la caméra ne bouge pas
  let tangage = 0; // tilt
  let roulis = 0;
  const decalage = new THREE.Vector3(); // translation commune de la caméra et du point visé (truck, pedestal, tracking)

  const mouvements = [plan.camera, ...(plan.camera.puis ?? [])];
  mouvements.forEach((m, rang) => {
    const debut = rang / mouvements.length; // fenêtre du mouvement dans le plan
    const fin = (rang + 1) / mouvements.length;
    const { mouvement, arrivee } = m;
    const amplitude = m.amplitude ?? "medium";
    const vitesse = m.vitesse ?? "normal";
    const p = avancement(borner((u - debut) / (fin - debut)), vitesse);
    const sens = /_(left|down|counterclockwise|out)$/.test(mouvement) ? -1 : 1;

    switch (mouvement) {
      case "push_in":
      case "pull_out":
      case "zoom_in":
      case "zoom_out": {
        const k = AMPLITUDES.resserrement[amplitude];
        const cible = arrivee ? cadrage(arrivee.taille) : { h: sens > 0 ? hCadre * (1 - k) : hCadre / (1 - k), cy: hauteurVisee };
        hCadre = hCadre + (cible.h - hCadre) * p;
        hauteurVisee = hauteurVisee + (cible.cy - hauteurVisee) * p;
        if (mouvement.startsWith("zoom")) champ = (2 * Math.atan(hCadre / (2 * distance))) / RAD; // la caméra reste en place, la focale change
        else distance = hCadre / (2 * Math.tan((champ * RAD) / 2)); // la caméra avance ou recule
        break;
      }
      case "pan_left":
      case "pan_right":
        lacet += -sens * AMPLITUDES.panoramique[amplitude] * RAD * p;
        break;
      case "tilt_up":
      case "tilt_down":
        tangage += sens * AMPLITUDES.bascule[amplitude] * RAD * p;
        break;
      case "truck_left":
      case "truck_right":
        decalage.addScaledVector(droiteDe(azimut), sens * AMPLITUDES.lateral[amplitude] * hCadre * aspect * p);
        break;
      case "pedestal_up":
      case "pedestal_down":
        decalage.y += sens * AMPLITUDES.vertical[amplitude] * hCadre * p;
        break;
      case "arc_left":
      case "arc_right":
        azimut += sens * AMPLITUDES.arc[amplitude] * RAD * p;
        break;
      case "tracking": {
        // Translation pure : la caméra reprend le déplacement du sujet pendant la fenêtre du mouvement.
        const suivi = descriptions.find((d) => d.id === m.suit);
        decalage.add(positionSujet(suivi, Math.min(fin, Math.max(debut, u)))).sub(positionSujet(suivi, debut));
        break;
      }
      case "shake": {
        if (u < debut || u > fin) break;
        // Somme de sinus : un tremblement irrégulier mais rejouable.
        const a = AMPLITUDES.tremblement[amplitude] * RAD;
        const f = FREQUENCES_TREMBLEMENT[vitesse] * 2 * Math.PI;
        lacet += a * (Math.sin(f * t) + 0.5 * Math.sin(2.3 * f * t + 1.3)) * 0.67;
        tangage += a * (Math.sin(1.3 * f * t + 0.7) + 0.5 * Math.sin(2.9 * f * t + 2.1)) * 0.67;
        break;
      }
      case "roll_clockwise":
      case "roll_counterclockwise":
        roulis += -sens * AMPLITUDES.roulis[amplitude] * RAD * p;
        break;
    }
  });

  const vise = new THREE.Vector3(centre.x, hauteurVisee, centre.z).add(decalage);
  const recul = new THREE.Vector3(Math.sin(azimut) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimut) * Math.cos(elevation));
  const position = vise.clone().addScaledVector(recul, distance);
  position.y = Math.max(HAUTEUR_MIN_CAMERA, position.y);

  const visee = vise.clone().sub(position);
  visee.applyAxisAngle(new THREE.Vector3(0, 1, 0), lacet);
  const droite = visee.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  visee.applyAxisAngle(droite, tangage);
  return { position, regarde: position.clone().add(visee), champ, roulis, u };
}

// ── Scène ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Construit la scène d'un plan et rend la fonction `image(i)` : dessine l'image i et la renvoie en PNG (data URL). */
export function preparer(toile, plan, n) {
  const [largeur, hauteur] = plan.resolution.split("x").map(Number);
  const rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, preserveDrawingBuffer: true });
  rendu.setPixelRatio(1);
  rendu.setSize(largeur, hauteur, true);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9c9c9c); // fond neutre, plus clair que le sol : l'horizon se lit
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.2)); // éclairage plat
  const appoint = new THREE.DirectionalLight(0xffffff, 0.9); // juste assez pour lire les volumes
  appoint.position.set(2, 6, 4);
  scene.add(appoint);

  const matiereSol = new THREE.MeshBasicMaterial({ color: 0x747474 });
  if ((plan.decor?.sol ?? "grille") === "grille") {
    // Damier de carreaux de 1,5 m en deux gris (un trait fin disparaît en vue rasante), décalé d'un demi-pas : chaque case de la
    // grille 3 × 3 est au centre d'un carreau.
    const motif = document.createElement("canvas");
    motif.width = motif.height = 2;
    const c = motif.getContext("2d");
    c.fillStyle = "#666666";
    c.fillRect(0, 0, 2, 2);
    c.fillStyle = "#848484";
    c.fillRect(0, 0, 1, 1);
    c.fillRect(1, 1, 1, 1);
    const damier = new THREE.CanvasTexture(motif);
    damier.colorSpace = THREE.SRGBColorSpace;
    damier.wrapS = damier.wrapT = THREE.RepeatWrapping;
    damier.repeat.set(30, 30);
    damier.offset.set(0.25, 0.25);
    damier.magFilter = THREE.NearestFilter;
    damier.anisotropy = rendu.capabilities.getMaxAnisotropy();
    matiereSol.color.set(0xffffff);
    matiereSol.map = damier;
  }
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(60 * PAS, 60 * PAS), matiereSol);
  sol.rotation.x = -Math.PI / 2;
  scene.add(sol);

  const descriptions = plan.sujets.map(decrireSujet);
  const objets = plan.sujets.map((s, rang) => {
    const objet = construireSujet(s, descriptions[rang], rang, plan.decor?.etiquettes ?? true);
    scene.add(objet);
    return objet;
  });

  const camera = new THREE.PerspectiveCamera(FOCALE, largeur / hauteur, 0.05, 200);

  return function image(i) {
    const etat = etatCamera(plan, descriptions, i, n);
    objets.forEach((objet, rang) => {
      const d = descriptions[rang];
      objet.position.copy(positionSujet(d, etat.u));
      const etiquette = objet.userData.etiquette;
      if (etiquette) {
        // Direction horizontale sujet → caméra, ramenée dans le repère (tourné) du sujet.
        const vers = etat.position.clone().sub(objet.position).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -d.lacet);
        etiquette.position.set(vers.x * d.largeur * 0.75, etiquette.position.y, vers.z * d.largeur * 0.75);
      }
    });
    camera.position.copy(etat.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(etat.regarde);
    camera.rotateZ(etat.roulis);
    camera.fov = etat.champ;
    camera.updateProjectionMatrix();
    rendu.render(scene, camera);
    return toile.toDataURL("image/png");
  };
}
