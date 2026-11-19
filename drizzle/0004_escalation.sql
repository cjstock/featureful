ALTER TABLE `matching_decisions` ADD `matcher_outcome` text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `closest_problem_id` integer REFERENCES problems(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `closest_confidence` real;--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `escalation_reasons` text;--> statement-breakpoint
ALTER TABLE `matching_decisions` ADD `regression_case` integer DEFAULT false NOT NULL;