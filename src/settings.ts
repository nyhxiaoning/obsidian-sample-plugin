import { App, PluginSettingTab, Setting } from 'obsidian';
import KnowledgeBasePlugin from './main';
import { zhCN } from './i18n/zh-CN';
import { clearLocalProviderTestState, type AiProviderKind, type LocalCliProviderSettings } from './settings-model';

export {
	DEFAULT_SETTINGS,
	normalizeSettings,
	type AiProviderKind,
	type KnowledgeBaseSettings,
	type LocalCliProviderSettings,
	type LocalCliProviderStatus,
} from './settings-model';

export type { KnowledgeBaseSettings as MyPluginSettings } from './settings-model';

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
		new Setting(containerEl)
			.setName(zhCN.settings.providerSelection)
			.setDesc(zhCN.settings.providerSelectionDesc)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('custom', zhCN.settings.aiProviderCustom)
					.addOption('codex', zhCN.settings.aiProviderCodex)
					.addOption('claude', zhCN.settings.aiProviderClaude)
					.addOption('gemini', zhCN.settings.aiProviderGemini)
					.addOption('opencode', zhCN.settings.aiProviderOpencode)
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async (value) => {
						this.plugin.selectAiProvider(value as AiProviderKind);
						await this.plugin.saveSettings();
						this.display();
					});
			});
		this.addTextSetting(
			zhCN.settings.apiBaseUrl,
			zhCN.settings.apiBaseUrlDesc,
			'https://api.openai.com/v1',
			'apiBaseUrl',
		);
		for (const kind of ['codex', 'claude', 'gemini', 'opencode'] as const) {
			this.addLocalProviderSetting(kind);
		}
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

	private addLocalProviderSetting(kind: Exclude<AiProviderKind, 'custom'>): void {
		const provider = this.plugin.settings.localCliProviders[kind];
		const card = this.containerEl.createDiv('knowledge-base-provider-card');
		new Setting(card).setName(zhCN.settings.providerName[kind]).setHeading();
		card.createEl('p', { text: zhCN.settings.providerCardDesc });
		new Setting(card)
			.setName(zhCN.settings.providerExecutablePath)
			.setDesc(zhCN.settings.providerExecutablePathDesc)
			.addText((text) => text.setValue(provider.executablePath).onChange(async (value) => {
				this.plugin.settings.localCliProviders[kind] = clearLocalProviderTestState({ ...provider, executablePath: value.trim() || kind });
				await this.plugin.saveSettings();
				this.display();
			}));
		const status = card.createEl('p', { cls: 'knowledge-base-provider-status' });
		status.setText(this.providerStatus(provider));
		new Setting(card)
			.setName(zhCN.settings.providerActions)
			.addButton((button) => button
				.setButtonText(zhCN.settings.detectProvider)
				.onClick(async () => {
					button.buttonEl.disabled = true;
					await this.plugin.detectLocalProvider(kind);
					this.display();
				}));
		new Setting(card)
			.addButton((button) => {
				button.setButtonText(zhCN.settings.testProvider);
				button.buttonEl.disabled = provider.status !== 'available' && provider.status !== 'tested';
				button.onClick(async () => {
					button.buttonEl.disabled = true;
					await this.plugin.testLocalProvider(kind);
					this.display();
				});
			})
			.addButton((button) => {
				button.setButtonText(zhCN.settings.useProvider).setCta();
				button.buttonEl.disabled = provider.status !== 'tested';
				button.onClick(async () => {
					this.plugin.selectAiProvider(kind);
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}

	private providerStatus(provider: LocalCliProviderSettings): string {
		const labels = {
			unknown: zhCN.settings.providerStatusUnknown,
			available: zhCN.settings.providerStatusAvailable,
			tested: zhCN.settings.providerStatusTested,
			failed: zhCN.settings.providerStatusFailed,
		};
		const parts: string[] = [labels[provider.status]];
		if (provider.version) parts.push(`${zhCN.settings.providerVersion}：${provider.version}`);
		if (provider.lastTestedAt) parts.push(`${zhCN.settings.providerLastTested}：${new Date(provider.lastTestedAt).toLocaleString()}`);
		if (provider.error) parts.push(`${zhCN.settings.providerError}：${provider.error}`);
		return parts.join(' · ');
	}

	private addTextSetting(
		name: string,
		description: string,
		placeholder: string,
		key: 'knowledgeBaseRoot' | 'rulesPath' | 'indexScriptPath' | 'pythonPath' | 'apiBaseUrl' | 'model',
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
