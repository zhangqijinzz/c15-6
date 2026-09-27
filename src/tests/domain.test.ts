import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  estimateDevice,
  normalizeScenario,
  summarizeScenario,
  validateDevice,
  validateGroupName,
} from '../domain';
import type { EnergyScenario } from '../types';

describe('energy domain', () => {
  it('calculates kWh and cost from watts, hours, days and price', () => {
    const result = estimateDevice({ id: 'a', name: '空调', watts: 1000, dailyHours: 2 }, 30, 0.5);
    expect(result).toEqual({ dailyKwh: 2, monthlyKwh: 60, monthlyCost: 30 });
  });

  it('keeps device shares explainable and sums to 100%', () => {
    const scenario: EnergyScenario = { id: 's', name: 'test', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: 'a', watts: 100, dailyHours: 1 }, { id: 'b', name: 'b', watts: 300, dailyHours: 1 },
    ] };
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe(12);
    expect(summary.devices.map((device) => device.share)).toEqual([0.25, 0.75]);
  });

  it('rejects negative power and more than 24 hours', () => {
    expect(validateDevice({ name: 'x', watts: -1, dailyHours: 1 })).toBe('功率不能为负数');
    expect(validateDevice({ name: 'x', watts: 1, dailyHours: 24.1 })).toBe('每日使用时间不能超过 24 小时');
  });

  it('normalizes a legacy scenario without groups into the default group without changing figures', () => {
    const legacy: EnergyScenario = { id: 's', name: '旧方案', pricePerKwh: 0.62, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: '空调', watts: 1200, dailyHours: 6 },
      { id: 'b', name: '冰箱', watts: 150, dailyHours: 10 },
    ] };
    const normalized = normalizeScenario(legacy);
    expect(normalized.groups).toEqual([{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }]);
    expect(normalized.devices.every((device) => device.groupId === DEFAULT_GROUP_ID)).toBe(true);

    const summary = summarizeScenario(legacy);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].id).toBe(DEFAULT_GROUP_ID);
    expect(summary.groups[0].total).toEqual(summary.total);
    expect(summary.groups[0].share).toBe(1);
    expect(summary.devices.map(({ id, watts, dailyHours }) => ({ id, watts, dailyHours }))).toEqual([
      { id: 'a', watts: 1200, dailyHours: 6 },
      { id: 'b', watts: 150, dailyHours: 10 },
    ]);
    expect(summary.total.monthlyKwh).toBeCloseTo((1200 * 6 + 150 * 10) * 30 / 1000);
  });

  it('computes group subtotals, group share of total, within-group share, and the top group', () => {
    const scenario: EnergyScenario = { id: 's', name: 'home', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', groups: [
      { id: 'g-living', name: '客厅' }, { id: 'g-kitchen', name: '厨房' }, { id: 'g-empty', name: '书房' }, { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME },
    ], devices: [
      { id: 'a', name: '空调', watts: 1000, dailyHours: 2, groupId: 'g-living' },
      { id: 'b', name: '电视', watts: 200, dailyHours: 2, groupId: 'g-living' },
      { id: 'c', name: '冰箱', watts: 100, dailyHours: 6, groupId: 'g-kitchen' },
      { id: 'd', name: '未知设备', watts: 300, dailyHours: 2, groupId: 'missing-group' },
    ] };
    const summary = summarizeScenario(scenario);
    const living = summary.groups.find((group) => group.id === 'g-living')!;
    const kitchen = summary.groups.find((group) => group.id === 'g-kitchen')!;
    const empty = summary.groups.find((group) => group.id === 'g-empty')!;
    const fallback = summary.groups.find((group) => group.id === DEFAULT_GROUP_ID)!;

    // 组小计：客厅 72 kWh，厨房 18 kWh，悬空设备 18 kWh 归入默认组
    expect(living.total.monthlyKwh).toBe(72);
    expect(kitchen.total.monthlyKwh).toBe(18);
    expect(fallback.total.monthlyKwh).toBe(18);
    expect(empty.total.monthlyKwh).toBe(0);
    expect(empty.deviceCount).toBe(0);
    expect(summary.total.monthlyKwh).toBe(108);
    // 组占整体的比例
    expect(living.share).toBeCloseTo(72 / 108);
    // 组内设备占比
    expect(living.devices.find((device) => device.id === 'a')?.share).toBeCloseTo(60 / 72);
    expect(living.devices.find((device) => device.id === 'b')?.share).toBeCloseTo(12 / 72);
    // 悬空引用进入默认组，计算不缺一块
    expect(fallback.devices.map((device) => device.id)).toEqual(['d']);
    expect(summary.groups.reduce((sum, group) => sum + group.total.monthlyKwh, 0)).toBe(108);
    // 用电最集中的组
    expect(summary.topGroup?.id).toBe('g-living');
  });

  it('rejects empty or overly long group names', () => {
    expect(validateGroupName('   ')).toBe('请填写分组名称');
    expect(validateGroupName('超'.repeat(13))).toContain('不能超过');
    expect(validateGroupName('客厅')).toBeNull();
  });
});
