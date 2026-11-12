"use client";






import type { GenerationVue } from "@/lib/queries-generations";
import type { GenreTache } from "@/lib/taches";


/** Une génération avec son rang dans la file et, si elle attend, le genre de la
 * tâche qui tient le GPU (une vidéo, un appel d'agent…). */
export type GenerationVivante = GenerationVue & { position: number | null; derriere: GenreTache | null };
