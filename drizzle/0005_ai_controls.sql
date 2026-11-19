CREATE TABLE `ai_module_flips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module` text NOT NULL,
	`on` integer NOT NULL,
	`person_id` integer NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_module_settings` (
	`module` text PRIMARY KEY NOT NULL,
	`on` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
-- One row per callable AI module, all on (hand-added to the generated migration).
INSERT OR IGNORE INTO `ai_module_settings` (`module`, `on`) VALUES ('matcher', 1), ('evaluator', 1), ('decision_note', 1), ('brief', 1);
