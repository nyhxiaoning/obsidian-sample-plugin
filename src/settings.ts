import { App, PluginSettingTab, Setting } from 'obsidian';
import KnowledgeBasePlugin from './main';
import { zhCN } from './i18n/zh-CN';

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
			.setName(zhCN.settings.configuration)
			.setHeading();
		containerEl.createEl('p', {
			text: zhCN.settings.privacy,
		});

		this.addTextSetting(
			zhCN.settings.knowledgeBaseRoot,
			zhCN.settings.knowledgeBaseRootDesc,
			'000ai知识库价值写作体系',
			'knowledgeBaseRoot',
		);
		this.addTextSetting(
			zhCN.settings.rulesPath,
			zhCN.settings.rulesPathDesc,
			'000ai知识库价值写作体系/系统/知识库规则.md',
			'rulesPath',
		);
		this.addTextSetting(
			zhCN.settings.indexScriptPath,
			zhCN.settings.indexScriptPathDesc,
			'000ai知识库价值写作体系/系统/generate-index.py',
			'indexScriptPath',
		);
		this.addTextSetting(
			zhCN.settings.pythonExecutable,
			zhCN.settings.pythonExecutableDesc,
			'/usr/bin/python3',
			'pythonPath',
		);

		new Setting(containerEl).setName(zhCN.settings.aiProvider).setHeading();
		this.addTextSetting(
			zhCN.settings.apiBaseUrl,
			zhCN.settings.apiBaseUrlDesc,
			'https://api.openai.com/v1',
			'apiBaseUrl',
		);
		this.addTextSetting(
			zhCN.settings.model,
			zhCN.settings.modelDesc,
			'gpt-4o-mini',
			'model',
		);

		new Setting(containerEl)
			.setName(zhCN.settings.apiKey)
			.setDesc(zhCN.settings.apiKeyDesc)
			.addText((text) => {
				text
					.setPlaceholder(zhCN.settings.apiKeyPlaceholder)
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'password';
			});

		new Setting(containerEl)
			.setName(zhCN.settings.requestTimeout)
			.setDesc(zhCN.settings.requestTimeoutDesc)
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
