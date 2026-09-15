CREATE TYPE "public"."bid_status" AS ENUM('pending', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."genre" AS ENUM('fitness', 'health', 'beauty', 'fashion', 'gaming', 'tech', 'food', 'travel', 'music', 'finance');--> statement-breakpoint
CREATE TYPE "public"."loss_reason" AS ENUM('over_budget', 'budget_exhausted', 'slots_filled');--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"fit_score" integer NOT NULL,
	"fit_breakdown" jsonb NOT NULL,
	"status" "bid_status" DEFAULT 'pending' NOT NULL,
	"loss_reason" "loss_reason",
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_amount_positive" CHECK ("bids"."amount_cents" > 0),
	CONSTRAINT "bids_fit_score_range" CHECK ("bids"."fit_score" BETWEEN 0 AND 100),
	CONSTRAINT "bids_loss_reason_matches_status" CHECK (("bids"."loss_reason" IS NULL) OR ("bids"."status" = 'lost'))
);
--> statement-breakpoint
CREATE TABLE "campaign_closures" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_awarded_cents" integer NOT NULL,
	"winner_count" integer NOT NULL,
	"algorithm_version" text NOT NULL,
	"decision" jsonb NOT NULL,
	CONSTRAINT "closures_total_non_negative" CHECK ("campaign_closures"."total_awarded_cents" >= 0),
	CONSTRAINT "closures_winner_count_non_negative" CHECK ("campaign_closures"."winner_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"budget_cents" integer NOT NULL,
	"target_genre" "genre" NOT NULL,
	"strict_genre" boolean DEFAULT false NOT NULL,
	"min_followers" integer DEFAULT 0 NOT NULL,
	"min_engagement_bps" integer DEFAULT 0 NOT NULL,
	"max_winners" integer NOT NULL,
	"bidding_deadline" timestamp with time zone NOT NULL,
	"status" "campaign_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_budget_positive" CHECK ("campaigns"."budget_cents" > 0),
	CONSTRAINT "campaigns_max_winners_positive" CHECK ("campaigns"."max_winners" > 0),
	CONSTRAINT "campaigns_closed_at_matches_status" CHECK (("campaigns"."status" = 'closed') = ("campaigns"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text NOT NULL,
	"genre" "genre" NOT NULL,
	"follower_count" integer NOT NULL,
	"engagement_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_followers_non_negative" CHECK ("creators"."follower_count" >= 0),
	CONSTRAINT "creators_engagement_non_negative" CHECK ("creators"."engagement_bps" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_closures" ADD CONSTRAINT "campaign_closures_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bids_one_per_creator_per_campaign" ON "bids" USING btree ("campaign_id","creator_id");--> statement-breakpoint
CREATE INDEX "bids_by_creator_idx" ON "bids" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "bids_by_campaign_status_idx" ON "bids" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_open_by_deadline_idx" ON "campaigns" USING btree ("status","bidding_deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_handle_key" ON "creators" USING btree ("handle");