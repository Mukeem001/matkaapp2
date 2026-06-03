-- Fix: Change foreign key constraint from ON DELETE no action to ON DELETE CASCADE
-- This ensures that when a market is deleted, all associated results are automatically deleted
-- Bids will remain (no FK constraint) for historical tracking of user bets

ALTER TABLE "results_2" DROP CONSTRAINT "results_2_market_id_markets2_id_fk";
--> statement-breakpoint
ALTER TABLE "results_2" ADD CONSTRAINT "results_2_market_id_markets2_id_fk" FOREIGN KEY ("market_id") REFERENCES "markets2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

