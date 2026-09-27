import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Ne pas lever d'erreur ici : ce module est importé pendant la collecte des
// pages au build Next.js, avant que les variables d'environnement runtime
// (fournies par docker-compose) ne soient disponibles. La connexion
// postgres-js est paresseuse — elle ne se fait qu'au premier appel réel.
const connectionString = process.env.DATABASE_URL ?? "postgres://invalid/invalid";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
