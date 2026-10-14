CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`organization` text NOT NULL,
	`facility` text NOT NULL,
	`branches` text NOT NULL,
	`interest` text NOT NULL,
	`plan` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inquiries_user_created_idx` ON `inquiries` (`user_id`,`created_at`);