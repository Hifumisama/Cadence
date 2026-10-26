-- Taux de cache du prompt par appel LLM (bloc `timings` de llama-server) : jetons repris du cache / préremplis. Null = non mesuré.
ALTER TABLE "agent_traces" ADD COLUMN "tokens_cache" integer;--> statement-breakpoint
ALTER TABLE "agent_traces" ADD COLUMN "tokens_prefill" integer;
