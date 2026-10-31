import type { KnowledgeRules } from './rule-schema';

/** Return a fresh copy of the approved executable rule contract for first-use migration. */
export function createDefaultKnowledgeRules(): KnowledgeRules {
	return {
		schemaVersion: 1,
		scope: { root: '000ai知识库价值写作体系', include: ['**/*.md'], exclude: ['系统/**'] },
		frontmatter: { enabled: true, required: ['title', 'status', 'created', 'updated'], allowedStatus: ['draft', 'reviewing', 'verified', 'deprecated'] },
		checks: { fileName: true, directory: true, source: true, duplicateTopic: true, relatedLinks: true },
		actions: { patchFrontmatter: 'confirm', applyTemplate: 'confirm', moveFile: 'confirm', regenerateIndex: 'allowed', deleteFile: 'denied' },
		ai: { tasks: ['classify', 'summarize', 'suggestRelations', 'suggestChanges'], manualOnly: true },
		dailyBackfill: { enabled: true, dailyReview: 'manual', weeklyReview: 'manual' },
	};
}
