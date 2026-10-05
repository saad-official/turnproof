CREATE SCHEMA IF NOT EXISTS "turnproof";
--> statement-breakpoint
CREATE TYPE "turnproof"."member_role" AS ENUM('host', 'cleaner');--> statement-breakpoint
CREATE TYPE "turnproof"."platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "turnproof"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnproof"."devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" "turnproof"."platform" NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_expo_push_token_unique" UNIQUE("expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."issues" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"turnover_id" text NOT NULL,
	"property_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnproof"."photo_blobs" (
	"photo_id" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnproof"."photos" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"turnover_id" text NOT NULL,
	"property_id" text NOT NULL,
	"user_id" text NOT NULL,
	"phase" text NOT NULL,
	"stamp" jsonb NOT NULL,
	"content_type" text,
	"remote_url" text,
	"blob_pathname" text,
	"bytes" integer,
	"received_sha256" text,
	"hash_matches" boolean,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "turnproof"."proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"turnover_id" text NOT NULL,
	"published_by" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "proofs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."properties" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_user_id" text NOT NULL,
	"invite_code" text,
	"name" text NOT NULL,
	CONSTRAINT "properties_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."property_members" (
	"property_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "turnproof"."member_role" NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_members_property_id_user_id_pk" PRIMARY KEY("property_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."turnovers" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"property_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "turnproof"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "turnproof"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turnproof"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."devices" ADD CONSTRAINT "devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."issues" ADD CONSTRAINT "issues_turnover_id_turnovers_id_fk" FOREIGN KEY ("turnover_id") REFERENCES "turnproof"."turnovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."issues" ADD CONSTRAINT "issues_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "turnproof"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."issues" ADD CONSTRAINT "issues_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."photo_blobs" ADD CONSTRAINT "photo_blobs_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "turnproof"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."photos" ADD CONSTRAINT "photos_turnover_id_turnovers_id_fk" FOREIGN KEY ("turnover_id") REFERENCES "turnproof"."turnovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."photos" ADD CONSTRAINT "photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "turnproof"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."photos" ADD CONSTRAINT "photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."proofs" ADD CONSTRAINT "proofs_turnover_id_turnovers_id_fk" FOREIGN KEY ("turnover_id") REFERENCES "turnproof"."turnovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."proofs" ADD CONSTRAINT "proofs_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."properties" ADD CONSTRAINT "properties_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."property_members" ADD CONSTRAINT "property_members_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "turnproof"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."property_members" ADD CONSTRAINT "property_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."turnovers" ADD CONSTRAINT "turnovers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "turnproof"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnproof"."turnovers" ADD CONSTRAINT "turnovers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "turnproof"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "turnproof"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "turnproof"."devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issues_property_server_updated_idx" ON "turnproof"."issues" USING btree ("property_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "issues_turnover_idx" ON "turnproof"."issues" USING btree ("turnover_id");--> statement-breakpoint
CREATE INDEX "photos_property_server_updated_idx" ON "turnproof"."photos" USING btree ("property_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "photos_turnover_idx" ON "turnproof"."photos" USING btree ("turnover_id");--> statement-breakpoint
CREATE INDEX "photos_uploaded_idx" ON "turnproof"."photos" USING btree ("uploaded_at") WHERE "turnproof"."photos"."uploaded_at" is not null;--> statement-breakpoint
CREATE INDEX "proofs_turnover_idx" ON "turnproof"."proofs" USING btree ("turnover_id");--> statement-breakpoint
CREATE INDEX "proofs_expires_idx" ON "turnproof"."proofs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "properties_owner_idx" ON "turnproof"."properties" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "properties_server_updated_idx" ON "turnproof"."properties" USING btree ("server_updated_at");--> statement-breakpoint
CREATE INDEX "property_members_user_idx" ON "turnproof"."property_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "turnproof"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "turnovers_property_server_updated_idx" ON "turnproof"."turnovers" USING btree ("property_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "turnproof"."verification" USING btree ("identifier");