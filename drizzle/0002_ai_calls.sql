CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`time` integer NOT NULL,
	`module` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_no_cache` integer DEFAULT 0 NOT NULL,
	`cache_read` integer DEFAULT 0 NOT NULL,
	`cache_write` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`outcome` text NOT NULL,
	`error` text,
	`related_type` text,
	`related_id` integer,
	`person_id` integer,
	`source` text NOT NULL,
	`system` text NOT NULL,
	`prompt` text NOT NULL,
	`output` text,
	`shown_problems` text,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `ai_call_id` integer REFERENCES ai_calls(id) ON DELETE set null;