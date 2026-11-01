import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDailyPlan } from '../../src/daily/daily-plan-validator';

const date = new Date(2026, 10, 1);
const validPlan = `# 每日 Todo - 2026-11-01

## 一、今日规划概览
- 主要任务数量：4/4
- 自主学习时间预算：6 小时
- 认知容量：6/6
## 二、今日任务
### 01. 核心任务
### 02. 辅助任务
### 03. 辅助任务
### 04. 生活或成长任务
## 三、时间安排
## 四、风险提示
## 五、AI 优化建议
## 六、执行记录
## 七、每日复盘
`;

void describe('validateDailyPlan', () => {
	void it('accepts a plan with the expected date, chapters, and limits', () => {
		deepEqual(validateDailyPlan(validPlan, date), { valid: true, errors: [] });
	});

	void it('reports wrong date and missing core headings', () => {
		const result = validateDailyPlan('# 每日 Todo - 2026-11-02\n## 一、今日规划概览', date);
		equal(result.valid, false);
		equal(result.errors.some((error) => error.includes('2026-11-01')), true);
		equal(result.errors.some((error) => error.includes('今日任务')), true);
	});

	void it('rejects more than four tasks, more than six hours, and more than six capacity units', () => {
		const result = validateDailyPlan(validPlan
			.replace('主要任务数量：4/4', '主要任务数量：5/4')
			.replace('自主学习时间预算：6 小时', '自主学习时间预算：7 小时')
			.replace('认知容量：6/6', '认知容量：7/6')
			.replace('### 04. 生活或成长任务', '### 04. 生活或成长任务\n### 05. 额外任务'), date);
		equal(result.valid, false);
		equal(result.errors.some((error) => error.includes('4 件')), true);
		equal(result.errors.some((error) => error.includes('6 小时')), true);
		equal(result.errors.some((error) => error.includes('6 单位')), true);
	});
});

