import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	KnowledgeBaseSettingTab,
	KnowledgeBaseSettings,
} from './settings';

export default class KnowledgeBasePlugin extends Plugin {
	settings!: KnowledgeBaseSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new KnowledgeBaseSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<KnowledgeBaseSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
