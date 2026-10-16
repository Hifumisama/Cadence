-- Un asset a deux noms : le `code` (préfixe de type + premier nom, immuable : c'est l'identifiant) et le `label` (le nom que l'utilisateur
-- peut changer, prioritaire dans l'interface). Les assets existants gardent label NULL : l'interface affiche alors le code lisible.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "label" varchar(120);
