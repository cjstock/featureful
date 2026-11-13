CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`need` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`decision_note` text,
	`created_at` integer NOT NULL,
	`impact_score` integer,
	`impact_reason` text,
	`strategic_fit_score` integer,
	`strategic_fit_reason` text,
	`effort_score` integer,
	`effort_reason` text,
	`risk_score` integer,
	`risk_reason` text,
	`evaluated_at` integer,
	`override_score` integer,
	`override_note` text,
	`brief_markdown` text,
	`brief_generated_at` integer
);
--> statement-breakpoint
CREATE TABLE `product_strategy` (
	`id` integer PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`problem_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supports` (
	`person_id` integer NOT NULL,
	`problem_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`person_id`, `problem_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
