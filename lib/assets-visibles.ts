import { ne } from "drizzle-orm";
import { assets } from "../db/schema";
import { TYPE_AFFICHE } from "./affiches";

/** À ajouter à TOUTE lecture « les assets d'un projet » (registre, totaux, contextes de l'agent, sources de génération…) :
 * les affiches de présentation sont des assets d'implémentation, invisibles du registre (voir lib/affiches.ts).
 * Les lectures par id, par code ou par type précis n'en ont pas besoin. */
export const horsAffiches = ne(assets.type, TYPE_AFFICHE);
