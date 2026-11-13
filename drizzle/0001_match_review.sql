CREATE TABLE `matching_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`proposed_problem_id` integer,
	`confidence` real,
	`reason` text,
	`proposed_title` text NOT NULL,
	`proposed_need` text NOT NULL,
	`submitter_choice` text NOT NULL,
	`created_at` integer NOT NULL,
	`verdict` text,
	`reviewer_id` integer,
	`reviewed_at` integer,
	`note` text,
	`from_problem_id` integer,
	`to_problem_id` integer,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewer_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matching_decisions_request_id_unique` ON `matching_decisions` (`request_id`);--> statement-breakpoint
ALTER TABLE `problems` ADD `boundary_note` text;