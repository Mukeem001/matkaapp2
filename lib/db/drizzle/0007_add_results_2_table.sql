CREATE TABLE "results_2" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" integer NOT NULL,
	"result_date" date NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "results_2" ADD CONSTRAINT "results_2_market_id_markets2_id_fk" FOREIGN KEY ("market_id") REFERENCES "markets2"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "results_2_market_id_idx" ON "results_2" ("market_id");
--> statement-breakpoint
CREATE INDEX "results_2_date_idx" ON "results_2" ("result_date");
