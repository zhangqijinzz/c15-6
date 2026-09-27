import type { DeviceGroup, EnergyDevice, EnergyEstimate, EnergyScenario, ScenarioSummary } from './types';

export const MAX_DAILY_HOURS = 24;
export const DEFAULT_GROUP_ID = 'group-default';
export const DEFAULT_GROUP_NAME = '未分组';

export const exampleScenario: EnergyScenario = {
  id: 'scenario-home',
  name: '夏日居家方案',
  pricePerKwh: 0.62,
  daysPerMonth: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  groups: [
    { id: 'group-living', name: '客厅' },
    { id: 'group-kitchen', name: '厨房' },
  ],
  devices: [
    { id: 'device-aircon', name: '客厅空调', watts: 1200, dailyHours: 6, groupId: 'group-living' },
    { id: 'device-fridge', name: '冰箱', watts: 150, dailyHours: 10, groupId: 'group-kitchen' },
    { id: 'device-lamp', name: '书桌台灯', watts: 12, dailyHours: 5 },
  ],
};

export function estimateDevice(device: EnergyDevice, daysPerMonth: number, pricePerKwh: number): EnergyEstimate {
  const dailyKwh = (device.watts * device.dailyHours) / 1000;
  const monthlyKwh = dailyKwh * daysPerMonth;
  return { dailyKwh, monthlyKwh, monthlyCost: monthlyKwh * pricePerKwh };
}

export type NormalizedScenario = EnergyScenario & { groups: DeviceGroup[] };

export function normalizeScenario(scenario: EnergyScenario): NormalizedScenario {
  const existing = (scenario.groups ?? []).filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string');
  const groups = existing.some((group) => group.id === DEFAULT_GROUP_ID)
    ? existing
    : [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }, ...existing];
  const known = new Set(groups.map((group) => group.id));
  const devices = scenario.devices.map((device) =>
    device.groupId && known.has(device.groupId) ? device : { ...device, groupId: DEFAULT_GROUP_ID },
  );
  return { ...scenario, groups, devices };
}

export function summarizeScenario(scenario: EnergyScenario): ScenarioSummary {
  const normalized = normalizeScenario(scenario);
  const devices = normalized.devices.map((device) => ({
    ...device,
    groupId: device.groupId ?? DEFAULT_GROUP_ID,
    ...estimateDevice(device, scenario.daysPerMonth, scenario.pricePerKwh),
    share: 0,
    groupShare: 0,
  }));
  const total = devices.reduce(
    (sum, device) => ({
      dailyKwh: sum.dailyKwh + device.dailyKwh,
      monthlyKwh: sum.monthlyKwh + device.monthlyKwh,
      monthlyCost: sum.monthlyCost + device.monthlyCost,
    }),
    { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 },
  );
  const withTotalShare = devices.map((device) => ({ ...device, share: total.monthlyKwh ? device.monthlyKwh / total.monthlyKwh : 0 }));
  const groups = normalized.groups.map((group) => {
    const members = withTotalShare.filter((device) => device.groupId === group.id);
    const subtotal = members.reduce(
      (sum, device) => ({
        dailyKwh: sum.dailyKwh + device.dailyKwh,
        monthlyKwh: sum.monthlyKwh + device.monthlyKwh,
        monthlyCost: sum.monthlyCost + device.monthlyCost,
      }),
      { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 },
    );
    return {
      id: group.id,
      name: group.name,
      ...subtotal,
      share: total.monthlyKwh ? subtotal.monthlyKwh / total.monthlyKwh : 0,
      devices: members.map((device) => ({ ...device, groupShare: subtotal.monthlyKwh ? device.monthlyKwh / subtotal.monthlyKwh : 0 })),
    };
  });
  const groupShareById = new Map(groups.flatMap((group) => group.devices.map((device) => [device.id, device.groupShare] as const)));
  return {
    total,
    devices: withTotalShare.map((device) => ({ ...device, groupShare: groupShareById.get(device.id) ?? 0 })),
    groups,
  };
}

export function validateDevice(device: Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>): string | null {
  if (!device.name.trim()) return '请填写设备名称';
  if (!Number.isFinite(device.watts) || device.watts < 0) return '功率不能为负数';
  if (!Number.isFinite(device.dailyHours) || device.dailyHours < 0) return '使用时间不能为负数';
  if (device.dailyHours > MAX_DAILY_HOURS) return '每日使用时间不能超过 24 小时';
  return null;
}

export function validateGroupName(name: string, groups: DeviceGroup[], excludeId?: string): string | null {
  if (!name.trim()) return '分组名称不能为空';
  if (groups.some((group) => group.id !== excludeId && group.name === name.trim())) return '分组名称已存在';
  return null;
}

export function validateScenarioSettings(pricePerKwh: number, daysPerMonth: number): string | null {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh < 0) return '电价不能为负数';
  if (!Number.isFinite(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) return '计费天数需在 1–31 天之间';
  return null;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function cloneScenario(source: EnergyScenario, id: string, name: string): EnergyScenario {
  return {
    ...source,
    id,
    name,
    createdAt: new Date().toISOString(),
    groups: source.groups?.map((group) => ({ ...group })),
    devices: source.devices.map((device) => ({ ...device, id: `${id}-${device.id}` })),
  };
}
