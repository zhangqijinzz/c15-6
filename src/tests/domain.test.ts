import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, estimateDevice, normalizeScenario, summarizeScenario, validateDevice, validateGroupName } from '../domain';
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
});

describe('device groups', () => {
  it('normalizes legacy scenarios into the default group without touching device details', () => {
    const legacy: EnergyScenario = { id: 's', name: '旧方案', pricePerKwh: 1, daysPerMonth: 30, createdAt: '', devices: [
      { id: 'a', name: 'a', watts: 100, dailyHours: 1 },
      { id: 'b', name: 'b', watts: 300, dailyHours: 1, groupId: 'group-gone' },
    ] };
    const normalized = normalizeScenario(legacy);
    expect(normalized.groups?.[0]).toEqual({ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME });
    expect(normalized.devices.every((device) => device.groupId === DEFAULT_GROUP_ID)).toBe(true);
    expect(normalized.devices.map((device) => [device.name, device.watts, device.dailyHours])).toEqual([['a', 100, 1], ['b', 300, 1]]);
  });

  it('keeps the default group first when a scenario already has groups', () => {
    const normalized = normalizeScenario({ id: 's', name: 't', pricePerKwh: 1, daysPerMonth: 30, createdAt: '',
      groups: [{ id: 'g1', name: '客厅' }],
      devices: [{ id: 'a', name: 'a', watts: 100, dailyHours: 1, groupId: 'g1' }] });
    expect(normalized.groups?.map((group) => group.id)).toEqual([DEFAULT_GROUP_ID, 'g1']);
    expect(normalized.devices[0].groupId).toBe('g1');
  });

  it('subtotals groups while the overall total matches the ungrouped calculation', () => {
    const scenario: EnergyScenario = { id: 's', name: 't', pricePerKwh: 0.5, daysPerMonth: 30, createdAt: '',
      groups: [{ id: 'g1', name: '客厅' }, { id: 'g2', name: '厨房' }, { id: 'g3', name: '空组' }],
      devices: [
        { id: 'a', name: '空调', watts: 1000, dailyHours: 2, groupId: 'g1' },
        { id: 'b', name: '冰箱', watts: 150, dailyHours: 10, groupId: 'g2' },
        { id: 'c', name: '台灯', watts: 12, dailyHours: 5 },
        { id: 'd', name: '电视', watts: 100, dailyHours: 5, groupId: 'g1' },
      ] };
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe(60 + 45 + (12 * 5 / 1000) * 30 + 15);
    const byId = new Map(summary.groups.map((group) => [group.id, group]));
    expect(byId.get('g1')?.monthlyKwh).toBe(75);
    expect(byId.get('g2')?.monthlyKwh).toBe(45);
    expect(byId.get(DEFAULT_GROUP_ID)?.monthlyKwh).toBe((12 * 5 / 1000) * 30);
    expect(byId.get('g3')?.monthlyKwh).toBe(0);
    expect(byId.get('g3')?.devices).toHaveLength(0);
    expect(summary.groups.reduce((sum, group) => sum + group.monthlyKwh, 0)).toBeCloseTo(summary.total.monthlyKwh, 10);
    expect(summary.groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1, 10);
  });

  it('tracks each device share within its own group', () => {
    const scenario: EnergyScenario = { id: 's', name: 't', pricePerKwh: 0.5, daysPerMonth: 30, createdAt: '',
      groups: [{ id: 'g1', name: '客厅' }],
      devices: [
        { id: 'a', name: '空调', watts: 1000, dailyHours: 2, groupId: 'g1' },
        { id: 'd', name: '电视', watts: 100, dailyHours: 5, groupId: 'g1' },
        { id: 'c', name: '台灯', watts: 12, dailyHours: 5 },
      ] };
    const summary = summarizeScenario(scenario);
    const byId = new Map(summary.devices.map((device) => [device.id, device]));
    expect(byId.get('a')?.groupShare).toBe(0.8);
    expect(byId.get('d')?.groupShare).toBe(0.2);
    expect(byId.get('c')?.groupShare).toBe(1);
    const living = summary.groups.find((group) => group.id === 'g1');
    expect(living?.devices.reduce((sum, device) => sum + device.groupShare, 0)).toBeCloseTo(1, 10);
  });

  it('validates group names', () => {
    const groups = [{ id: 'g1', name: '客厅' }];
    expect(validateGroupName('   ', groups)).toBe('分组名称不能为空');
    expect(validateGroupName('客厅', groups)).toBe('分组名称已存在');
    expect(validateGroupName('客厅', groups, 'g1')).toBeNull();
    expect(validateGroupName('厨房', groups)).toBeNull();
  });
});
