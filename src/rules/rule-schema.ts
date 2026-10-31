export type ConfirmedAction = 'confirm' | 'denied';
export type IndexAction = 'allowed' | 'denied';

export interface KnowledgeRules {
	schemaVersion: 1;
	scope: {
		root: string;
		include: string[];
		exclude: string[];
	};
	frontmatter: {
		enabled: boolean;
		required: string[];
		allowedStatus: string[];
	};
	checks: {
		fileName: boolean;
		directory: boolean;
		source: boolean;
		duplicateTopic: boolean;
		relatedLinks: boolean;
	};
	actions: {
		patchFrontmatter: ConfirmedAction;
		applyTemplate: ConfirmedAction;
		moveFile: ConfirmedAction;
		regenerateIndex: IndexAction;
		deleteFile: 'denied';
	};
	ai: {
		tasks: string[];
		manualOnly: true;
	};
	dailyBackfill: {
		enabled: boolean;
		dailyReview: 'manual';
		weeklyReview: 'manual';
	};
}
