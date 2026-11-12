import assert from "node:assert/strict";
import { test } from "node:test";
import { nomFichierAsset } from "./assetCode";

test("nom de fichier d'asset : code + extension de média connue, en minuscules", () => {
  assert.equal(nomFichierAsset("CHAR_maya", "portrait.PNG"), "CHAR_maya.png");
  assert.equal(nomFichierAsset("DEC_phare", "clip.mp4"), "DEC_phare.mp4");
});

test("nom de fichier d'asset : un code qui est un chemin est refusé", () => {
  for (const code of ["../x", "a/b", "..\\x", "CHAR maya", "", "CHAR.maya", "é"]) assert.throws(() => nomFichierAsset(code, "a.png"), /Code d'asset invalide/, code);
});

test("nom de fichier d'asset : extension inconnue ou absente refusée", () => {
  for (const nom of ["a.exe", "a.html", "a", "a.png.exe", ".png.svg"]) assert.throws(() => nomFichierAsset("CHAR_maya", nom), /Format de fichier/, nom);
});
