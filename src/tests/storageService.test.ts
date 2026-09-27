// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, exampleScenario, summarizeScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to a valid example when saved JSON is damaged', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('opens legacy scenarios without groups in the default group, totals unchanged', () => {
    const legacy = {
      version: 1,
      activeScenarioId: 's1',
      scenarios: [{
        id: 's1', name: '旧方案', pricePerKwh: 0.5, daysPerMonth: 30, createdAt: '2026-01-01T00:00:00.000Z',
        devices: [
          { id: 'd1', name: '空调', watts: 1000, dailyHours: 2 },
          { id: 'd2', name: '冰箱', watts: 150, dailyHours: 10 },
        ],
      }],
    };
    localStorage.setItem('energy-lens.document.v1', JSON.stringify(legacy));
    const recovered = new LocalEnergyRepository().load();
    const scenario = recovered.scenarios[0];
    expect(scenario.groups).toEqual([{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }]);
    expect(scenario.devices.every((device) => device.groupId === DEFAULT_GROUP_ID)).toBe(true);
    expect(scenario.devices.map(({ id, name, watts, dailyHours }) => ({ id, name, watts, dailyHours }))).toEqual(legacy.scenarios[0].devices);
    const summary = summarizeScenario(scenario);
    expect(summary.total.monthlyKwh).toBe((1000 * 2 + 150 * 10) / 1000 * 30);
    expect(summary.total.monthlyCost).toBe(summary.total.monthlyKwh * 0.5);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].monthlyKwh).toBe(summary.total.monthlyKwh);
    expect(summary.groups[0].share).toBe(1);
  });

  it('round-trips documents that already contain groups', () => {
    const repository = new LocalEnergyRepository();
    const document = repository.load();
    repository.save(document);
    const recovered = repository.load();
    expect(recovered.scenarios[0].groups?.map((group) => group.name)).toEqual(['未分组', '客厅', '厨房']);
    expect(recovered.scenarios[0].devices.find((device) => device.id === 'device-fridge')?.groupId).toBe('group-kitchen');
  });
});
