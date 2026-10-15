CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`organization` text NOT NULL,
	`quote` text NOT NULL,
	`rating` integer NOT NULL,
	`locale` text DEFAULT 'ar' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`consent` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_status_created_idx` ON `reviews` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `inquiries` ADD `locale` text DEFAULT 'ar' NOT NULL;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `offer` text DEFAULT '' NOT NULL;