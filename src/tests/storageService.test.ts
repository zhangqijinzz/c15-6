// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_ID, exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to a valid example when saved JSON is damaged', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('migrates saved scenarios without groups into the default group, keeping totals identical', () => {
    const legacy = {
      version: 1 as const,
      activeScenarioId: 'legacy-s',
      scenarios: [{
        id: 'legacy-s',
        name: '老方案',
        pricePerKwh: 0.6,
        daysPerMonth: 30,
        createdAt: '2025-01-01T00:00:00.000Z',
        devices: [
          { id: 'd1', name: '空调', watts: 1000, dailyHours: 4 },
          { id: 'd2', name: '冰箱', watts: 200, dailyHours: 12 },
        ],
      }],
    };
    localStorage.setItem('energy-lens.document.v1', JSON.stringify(legacy));
    const recovered = new LocalEnergyRepository().load();
    const scenario = recovered.scenarios[0];
    expect(scenario.groups).toEqual([{ id: DEFAULT_GROUP_ID, name: '默认组' }]);
    expect(scenario.devices.map((device) => device.groupId)).toEqual([DEFAULT_GROUP_ID, DEFAULT_GROUP_ID]);
    // 设备明细与总用电与旧版完全一致
    expect(scenario.devices.map((d) => [d.watts, d.dailyHours])).toEqual([[1000, 4], [200, 12]]);
    expect(scenario.devices.reduce((sum, d) => sum + (d.watts * d.dailyHours * scenario.daysPerMonth) / 1000, 0)).toBe(192);
    expect(recovered.activeScenarioId).toBe('legacy-s');
  });
});
