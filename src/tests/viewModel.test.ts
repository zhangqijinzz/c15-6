import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUP_ID, exampleScenario, normalizeScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => ({ ...data, scenarios: data.scenarios.map(normalizeScenario) }), save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
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

  it('lands ungrouped devices in the default group after loading', () => {
    expect(vm.activeScenario?.groups?.[0].id).toBe(DEFAULT_GROUP_ID);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-lamp')?.groupId).toBe(DEFAULT_GROUP_ID);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-aircon')?.groupId).toBe('group-living');
  });

  it('creates a group and moves a device into it', () => {
    vm.addGroup();
    const created = vm.activeScenario?.groups?.find((group) => group.name.startsWith('分组 '));
    expect(created).toBeDefined();
    vm.assignDeviceToGroup('device-lamp', created!.id);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-lamp')?.groupId).toBe(created!.id);
    const subtotal = vm.activeSummary?.groups.find((group) => group.id === created!.id);
    expect(subtotal?.monthlyKwh).toBe((12 * 5 / 1000) * 30);
    expect(subtotal?.devices[0].groupShare).toBe(1);
  });

  it('removing a group reassigns its devices to the default group without changing the total', () => {
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.removeGroup('group-living');
    expect(vm.activeScenario?.groups?.some((group) => group.id === 'group-living')).toBe(false);
    expect(vm.activeScenario?.devices.find((device) => device.id === 'device-aircon')?.groupId).toBe(DEFAULT_GROUP_ID);
    expect(vm.activeSummary?.total.monthlyKwh).toBe(before);
    const fallback = vm.activeSummary?.groups.find((group) => group.id === DEFAULT_GROUP_ID);
    expect(fallback?.devices.map((device) => device.id).sort()).toEqual(['device-aircon', 'device-lamp']);
  });

  it('protects the default group and validates renames', () => {
    vm.removeGroup(DEFAULT_GROUP_ID);
    expect(vm.activeScenario?.groups?.some((group) => group.id === DEFAULT_GROUP_ID)).toBe(true);
    vm.renameGroup('group-living', '   ');
    expect(vm.getState().notice?.text).toBe('分组名称不能为空');
    vm.renameGroup('group-living', '厨房');
    expect(vm.getState().notice?.text).toBe('分组名称已存在');
    vm.renameGroup('group-living', '影音区');
    expect(vm.activeScenario?.groups?.find((group) => group.id === 'group-living')?.name).toBe('影音区');
  });

  it('duplicating a scenario keeps its groups and assignments', () => {
    vm.duplicateActive();
    const copy = vm.activeScenario;
    expect(copy?.id).not.toBe(exampleScenario.id);
    expect(copy?.groups?.map((group) => group.name)).toEqual(['未分组', '客厅', '厨房']);
    expect(copy?.devices.find((device) => device.name === '客厅空调')?.groupId).toBe('group-living');
  });
});
