import { App, PluginSettingTab, Setting } from 'obsidian';
import KnowledgeBasePlugin from './main';

export interface KnowledgeBaseSettings {
	knowledgeBaseRoot: string;
	rulesPath: string;
	indexScriptPath: string;
	pythonPath: string;
	apiBaseUrl: string;
	model: string;
	apiKey: string;
	requestTimeoutMs: number;
}

export type { KnowledgeBaseSettings as MyPluginSettings };

export const DEFAULT_SETTINGS: KnowledgeBaseSettings = {
	knowledgeBaseRoot: '000ai知识库价值写作体系',
	rulesPath: '000ai知识库价值写作体系/系统/知识库规则.md',
	indexScriptPath: '000ai知识库价值写作体系/系统/generate-index.py',
	pythonPath: '/usr/bin/python3',
	apiBaseUrl: '',
	model: '',
	apiKey: '',
	requestTimeoutMs: 60000,
};

export class KnowledgeBaseSettingTab extends PluginSettingTab {
	plugin: KnowledgeBasePlugin;

	constructor(app: App, plugin: KnowledgeBasePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Configuration')
			.setHeading();
		containerEl.createEl('p', {
			text: 'Paths are relative to the active vault. The API key is stored locally and content is sent only after you confirm an upload preview.',
		});

		this.addTextSetting(
			'Knowledge base root',
			'Vault-relative folder containing the knowledge base.',
			'000ai知识库价值写作体系',
			'knowledgeBaseRoot',
		);
		this.addTextSetting(
			'Rules document path',
			'Vault-relative path to the executable Markdown rules document.',
			'000ai知识库价值写作体系/系统/知识库规则.md',
			'rulesPath',
		);
		this.addTextSetting(
			'Index script path',
			'Vault-relative path to generate-index.py.',
			'000ai知识库价值写作体系/系统/generate-index.py',
			'indexScriptPath',
		);
		this.addTextSetting(
			'Python executable',
			'Absolute path to the Python executable used for index operations.',
			'/usr/bin/python3',
			'pythonPath',
		);

		new Setting(containerEl).setName('AI provider').setHeading();
		this.addTextSetting(
			'API base URL',
			'OpenAI-compatible API base URL. Leave empty to disable AI requests.',
			'https://api.openai.com/v1',
			'apiBaseUrl',
		);
		this.addTextSetting(
			'Model',
			'Model name used for manual AI analysis.',
			'gpt-4o-mini',
			'model',
		);

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Stored only in the local plugin data store.')
			.addText((text) => {
				text
					.setPlaceholder('Enter API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		new Setting(containerEl)
			.setName('Request timeout')
			.setDesc('Maximum time to wait for an AI response, in milliseconds.')
			.addText((text) =>
				text
					.setPlaceholder('60000')
					.setValue(String(this.plugin.settings.requestTimeoutMs))
					.onChange(async (value) => {
						const timeout = Number.parseInt(value, 10);
						if (Number.isFinite(timeout) && timeout > 0) {
							this.plugin.settings.requestTimeoutMs = timeout;
							await this.plugin.saveSettings();
						}
					}),
			);
	}

	private addTextSetting(
		name: string,
		description: string,
		placeholder: string,
		key: Exclude<keyof KnowledgeBaseSettings, 'apiKey' | 'requestTimeoutMs'>,
	) {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						this.plugin.settings[key] = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
