import { cloneScenario, DEFAULT_GROUP_ID, summarizeScenario, validateDevice, validateGroupName, validateScenarioSettings } from './domain';
import { findScenario, type EnergyRepository } from './repository';
import type { DeviceGroup, EnergyDevice, EnergyDocument, EnergyScenario, Notice, ViewStatus } from './types';

export interface EnergyLensState {
  document: EnergyDocument | null;
  status: ViewStatus;
  notice: Notice | null;
}

type Listener = (state: EnergyLensState) => void;

export class EnergyLensViewModel {
  private state: EnergyLensState = { document: null, status: 'loading', notice: null };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: EnergyRepository) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): EnergyLensState { return this.state; }

  initialize(): void {
    try {
      this.state = { document: this.repository.load(), status: 'ready', notice: null };
    } catch {
      this.state = { document: null, status: 'error', notice: { kind: 'error', text: '本地数据读取失败，请刷新重试' } };
    }
    this.emit();
  }

  get activeScenario(): EnergyScenario | null {
    if (!this.state.document) return null;
    return findScenario(this.state.document, this.state.document.activeScenarioId) ?? null;
  }

  get activeSummary() {
    return this.activeScenario ? summarizeScenario(this.activeScenario) : null;
  }

  updateDevice(deviceId: string, patch: Partial<Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device = scenario.devices.find((item) => item.id === deviceId);
    if (!device) return;
    const next = { ...device, ...patch };
    const error = validateDevice(next);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.map((item) => item.id === deviceId ? next : item) }), '参数已更新');
  }

  addDevice(): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const device: EnergyDevice = { id: `device-${Date.now()}`, name: '新设备', watts: 100, dailyHours: 1, groupId: DEFAULT_GROUP_ID };
    this.commit((current) => ({ ...current, devices: [...current.devices, device] }), '已添加设备，可继续修改参数');
  }

  removeDevice(deviceId: string): void {
    const scenario = this.activeScenario;
    if (!scenario || scenario.devices.length <= 1) {
      this.setNotice({ kind: 'info', text: '至少保留一个设备，便于计算方案' });
      return;
    }
    this.commit((current) => ({ ...current, devices: current.devices.filter((item) => item.id !== deviceId) }), '设备已移除');
  }

  addGroup(): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const groups = scenario.groups ?? [];
    let index = groups.length + 1;
    let name = `分组 ${index}`;
    while (groups.some((group) => group.name === name)) {
      index += 1;
      name = `分组 ${index}`;
    }
    const group: DeviceGroup = { id: `group-${Date.now()}`, name };
    this.commit((current) => ({ ...current, groups: [...(current.groups ?? []), group] }), `已创建「${name}」，可以把设备归进去了`);
  }

  renameGroup(groupId: string, name: string): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const groups = scenario.groups ?? [];
    if (!groups.some((group) => group.id === groupId)) return;
    const error = validateGroupName(name, groups, groupId);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, groups: (current.groups ?? []).map((group) => group.id === groupId ? { ...group, name: name.trim() } : group) }), '分组已重命名');
  }

  removeGroup(groupId: string): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    if (groupId === DEFAULT_GROUP_ID) {
      this.setNotice({ kind: 'info', text: '默认分组用于承接未归组设备，不能删除' });
      return;
    }
    this.commit((current) => ({
      ...current,
      groups: (current.groups ?? []).filter((group) => group.id !== groupId),
      devices: current.devices.map((device) => device.groupId === groupId ? { ...device, groupId: DEFAULT_GROUP_ID } : device),
    }), '分组已删除，组内设备已归入默认分组');
  }

  assignDeviceToGroup(deviceId: string, groupId: string): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const known = new Set((scenario.groups ?? []).map((group) => group.id));
    const target = known.has(groupId) ? groupId : DEFAULT_GROUP_ID;
    this.commit((current) => ({ ...current, devices: current.devices.map((device) => device.id === deviceId ? { ...device, groupId: target } : device) }), '设备已归入分组');
  }

  updateSettings(patch: Partial<Pick<EnergyScenario, 'name' | 'pricePerKwh' | 'daysPerMonth'>>): void {
    const scenario = this.activeScenario;
    if (!scenario) return;
    const next = { ...scenario, ...patch };
    const error = validateScenarioSettings(next.pricePerKwh, next.daysPerMonth);
    if (error) {
      this.setNotice({ kind: 'error', text: error });
      return;
    }
    this.commit((current) => ({ ...current, name: next.name.trim() || '未命名方案', pricePerKwh: next.pricePerKwh, daysPerMonth: next.daysPerMonth }), '计费参数已更新');
  }

  duplicateActive(): void {
    const source = this.activeScenario;
    if (!source || !this.state.document) return;
    const id = `scenario-${Date.now()}`;
    const copy = cloneScenario(source, id, `${source.name} · 副本`);
    const document = { ...this.state.document, scenarios: [...this.state.document.scenarios, copy], activeScenarioId: id };
    this.persist(document, '方案已复制，现在可以修改副本');
  }

  selectScenario(id: string): void {
    if (!this.state.document || !findScenario(this.state.document, id)) return;
    this.persist({ ...this.state.document, activeScenarioId: id }, '已切换方案');
  }

  complete(): void {
    this.state = { ...this.state, status: 'completed', notice: { kind: 'success', text: '本次推演已保存，可随时回来继续调整' } };
    this.emit();
  }

  private commit(update: (scenario: EnergyScenario) => EnergyScenario, notice: string): void {
    if (!this.state.document) return;
    const document = { ...this.state.document, scenarios: this.state.document.scenarios.map((scenario) => scenario.id === this.state.document?.activeScenarioId ? update(scenario) : scenario) };
    this.persist(document, notice);
  }

  private persist(document: EnergyDocument, notice: string): void {
    try {
      this.repository.save(document);
      this.state = { document, status: 'editing', notice: { kind: 'success', text: notice } };
    } catch {
      this.state = { ...this.state, status: 'error', notice: { kind: 'error', text: '保存失败，当前页面仍可继续编辑' } };
    }
    this.emit();
  }

  private setNotice(notice: Notice): void {
    this.state = { ...this.state, status: notice.kind === 'error' ? 'error' : 'editing', notice };
    this.emit();
  }

  private emit(): void { this.listeners.forEach((listener) => listener(this.state)); }
}
