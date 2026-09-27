import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUP_ID, exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('creates and renames groups, assigns devices, and keeps the default group protected', () => {
    expect(vm.addGroup('  ')).toBe(false);
    expect(vm.getState().status).toBe('error');
    expect(vm.activeScenario?.groups).toHaveLength(3);

    expect(vm.addGroup('卧室')).toBe(true);
    const groupId = vm.activeScenario!.groups!.find((group) => group.name === '卧室')!.id;
    expect(vm.renameGroup(groupId, '主卧')).toBe(true);
    expect(vm.renameGroup(DEFAULT_GROUP_ID, '别的名字')).toBe(false);

    vm.assignDevice('device-aircon', groupId);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-aircon')?.groupId).toBe(groupId);
    expect(vm.activeSummary?.groups.find((group) => group.id === groupId)?.deviceCount).toBe(1);

    vm.removeGroup(DEFAULT_GROUP_ID);
    expect(vm.activeScenario?.groups!.some((group) => group.id === DEFAULT_GROUP_ID)).toBe(true);
  });

  it('moves devices back to the default group when their group is removed so no usage is lost', () => {
    vm.addGroup('阳台');
    const groupId = vm.activeScenario!.groups!.find((group) => group.name === '阳台')!.id;
    vm.assignDevice('device-fridge', groupId);
    const totalBefore = vm.activeSummary!.total.monthlyKwh;

    vm.removeGroup(groupId);
    const scenario = vm.activeScenario!;
    expect(scenario.groups!.some((group) => group.id === groupId)).toBe(false);
    expect(scenario.devices.find((device) => device.id === 'device-fridge')?.groupId).toBe(DEFAULT_GROUP_ID);
    // 删除分组不改变总用电
    expect(vm.activeSummary!.total.monthlyKwh).toBe(totalBefore);
    expect(vm.activeSummary!.groups.reduce((sum, group) => sum + group.total.monthlyKwh, 0)).toBe(totalBefore);
  });

  it('places newly added devices into the chosen group, defaulting to the default group', () => {
    vm.addDevice('group-kitchen');
    const added = vm.activeScenario!.devices.at(-1)!;
    expect(added.groupId).toBe('group-kitchen');
    vm.addDevice('does-not-exist');
    expect(vm.activeScenario!.devices.at(-1)!.groupId).toBe(DEFAULT_GROUP_ID);
  });
});
