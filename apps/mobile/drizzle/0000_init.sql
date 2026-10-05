CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`turnover_id` text NOT NULL,
	`room_id` text,
	`photo_id` text,
	`severity` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `issues_turnover_idx` ON `issues` (`turnover_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`turnover_id` text NOT NULL,
	`room_id` text,
	`phase` text NOT NULL,
	`local_uri` text,
	`remote_url` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`stamp_json` text NOT NULL,
	`upload_state` text DEFAULT 'local' NOT NULL,
	`upload_attempts` integer DEFAULT 0 NOT NULL,
	`upload_error` text,
	`next_attempt_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `photos_turnover_idx` ON `photos` (`turnover_id`,`room_id`);--> statement-breakpoint
CREATE INDEX `photos_upload_idx` ON `photos` (`upload_state`);--> statement-breakpoint
CREATE INDEX `photos_updated_idx` ON `photos` (`updated_at`);--> statement-breakpoint
CREATE TABLE `proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`turnover_id` text NOT NULL,
	`slug` text NOT NULL,
	`url` text NOT NULL,
	`published_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `proofs_turnover_idx` ON `proofs` (`turnover_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`checkout_time` text NOT NULL,
	`checkin_time` text NOT NULL,
	`access_notes` text,
	`rooms_json` text NOT NULL,
	`supplies_json` text NOT NULL,
	`invite_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`pushed_up_to` text,
	`pulled_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `turnovers` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`abandoned_at` text,
	`status` text NOT NULL,
	`current_room_index` integer DEFAULT 0 NOT NULL,
	`room_states_json` text NOT NULL,
	`duration_seconds` integer,
	`note` text,
	`forced` integer,
	`proof_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `turnovers_scheduled_idx` ON `turnovers` (`scheduled_for`);--> statement-breakpoint
CREATE INDEX `turnovers_property_idx` ON `turnovers` (`property_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `turnovers_status_idx` ON `turnovers` (`status`);