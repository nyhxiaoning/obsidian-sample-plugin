export interface DailyPlanValidationResult {
	valid: boolean;
	errors: string[];
}

const REQUIRED_HEADINGS = [
	'## 一、今日规划概览',
	'## 二、今日任务',
	'## 三、时间安排',
	'## 四、风险提示',
	'## 五、AI 优化建议',
	'## 六、执行记录',
	'## 七、每日复盘',
] as const;

function formatDate(date: Date): string {
	if (Number.isNaN(date.getTime())) throw new Error('Invalid planner date');
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function numberAfter(label: string, content: string): number | undefined {
	const match = content.match(new RegExp(`${label}\\s*[:：]\\s*([0-9]+(?:\\.[0-9]+)?)`));
	return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function validateDailyPlan(content: string, date: Date): DailyPlanValidationResult {
	const errors: string[] = [];
	const expectedDate = formatDate(date);
	if (!content.trim()) errors.push('计划内容不能为空。');
	if (!content.includes(`# 每日 Todo - ${expectedDate}`)) errors.push(`计划标题必须包含“# 每日 Todo - ${expectedDate}”。`);

	for (const heading of REQUIRED_HEADINGS) {
		if (!content.includes(heading)) errors.push(`缺少核心章节“${heading}”。`);
	}

	const taskSection = content.match(/## 二、今日任务([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
	const taskCount = (taskSection.match(/^###\s+\d+[.、]\s+/gm) ?? []).length;
	if (taskCount > 4) errors.push(`主要任务不能超过 4 件，当前识别到 ${taskCount} 件。`);
	const declaredTaskCount = numberAfter('主要任务数量', taskSection) ?? numberAfter('主要任务数量', content);
	if (declaredTaskCount !== undefined && declaredTaskCount > 4) errors.push('主要任务数量不能超过 4 件。');

	const hours = numberAfter('自主学习时间预算', content);
	if (hours !== undefined && hours > 6) errors.push('自主学习时间预算不能超过 6 小时。');

	const capacityMatch = content.match(/认知容量\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*6/);
	if (capacityMatch?.[1] !== undefined && Number(capacityMatch[1]) > 6) errors.push('认知容量不能超过 6 单位。');

	return { valid: errors.length === 0, errors };
}

