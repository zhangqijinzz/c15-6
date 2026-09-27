import type { DeviceGroup, EnergyDevice, EnergyEstimate, EnergyScenario, GroupSummary, ScenarioSummary } from './types';

export const MAX_DAILY_HOURS = 24;
export const MAX_GROUP_NAME_LENGTH = 12;

export const DEFAULT_GROUP_ID = 'group-default';
export const DEFAULT_GROUP_NAME = '默认组';
const FALLBACK_GROUP_NAME = '未命名分组';

export const exampleScenario: EnergyScenario = {
  id: 'scenario-home',
  name: '夏日居家方案',
  pricePerKwh: 0.62,
  daysPerMonth: 30,
  createdAt: '2026-01-01T00:00:00.000Z',
  groups: [
    { id: 'group-living', name: '客厅' },
    { id: 'group-kitchen', name: '厨房' },
    { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME },
  ],
  devices: [
    { id: 'device-aircon', name: '客厅空调', watts: 1200, dailyHours: 6, groupId: 'group-living' },
    { id: 'device-fridge', name: '冰箱', watts: 150, dailyHours: 10, groupId: 'group-kitchen' },
    { id: 'device-lamp', name: '书桌台灯', watts: 12, dailyHours: 5, groupId: 'group-living' },
  ],
};

export function estimateDevice(device: EnergyDevice, daysPerMonth: number, pricePerKwh: number): EnergyEstimate {
  const dailyKwh = (device.watts * device.dailyHours) / 1000;
  const monthlyKwh = dailyKwh * daysPerMonth;
  return { dailyKwh, monthlyKwh, monthlyCost: monthlyKwh * pricePerKwh };
}

function emptyEstimate(): EnergyEstimate {
  return { dailyKwh: 0, monthlyKwh: 0, monthlyCost: 0 };
}

function addEstimate(sum: EnergyEstimate, part: EnergyEstimate): EnergyEstimate {
  return {
    dailyKwh: sum.dailyKwh + part.dailyKwh,
    monthlyKwh: sum.monthlyKwh + part.monthlyKwh,
    monthlyCost: sum.monthlyCost + part.monthlyCost,
  };
}

/**
 * 归一化方案：保证存在默认组，设备必定归属一个存在的组。
 * 旧方案没有分组信息时，自动补出默认组并把所有设备归入其中，
 * 设备参数与分组结构互不影响，因此设备明细和总用电与旧版完全一致。
 */
export function normalizeScenario(scenario: EnergyScenario): EnergyScenario {
  const rawGroups = Array.isArray(scenario.groups) ? scenario.groups : [];
  const seen = new Set<string>();
  const groups: DeviceGroup[] = [];
  for (const group of rawGroups) {
    if (!group || typeof group.id !== 'string' || typeof group.name !== 'string' || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push({ id: group.id, name: group.id === DEFAULT_GROUP_ID ? group.name.trim() || DEFAULT_GROUP_NAME : group.name.trim() || FALLBACK_GROUP_NAME });
  }
  const defaultGroup = groups.find((group) => group.id === DEFAULT_GROUP_ID)
    ?? { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME };
  const orderedGroups = groups.some((group) => group.id === DEFAULT_GROUP_ID) ? groups : [defaultGroup, ...groups];
  const validIds = new Set(orderedGroups.map((group) => group.id));
  const devices = scenario.devices.map((device) => ({
    ...device,
    groupId: device.groupId && validIds.has(device.groupId) ? device.groupId : DEFAULT_GROUP_ID,
  }));
  return { ...scenario, groups: orderedGroups, devices };
}

export function summarizeScenario(scenario: EnergyScenario): ScenarioSummary {
  const normalized = normalizeScenario(scenario);
  const devices = normalized.devices.map((device) => ({
    ...device,
    groupId: device.groupId as string,
    ...estimateDevice(device, normalized.daysPerMonth, normalized.pricePerKwh),
    share: 0,
  }));
  const total = devices.reduce(addEstimate, emptyEstimate());
  const withShare = devices.map((device) => ({ ...device, share: total.monthlyKwh ? device.monthlyKwh / total.monthlyKwh : 0 }));

  const groups: GroupSummary[] = normalized.groups!.map((group) => {
    const groupDevices = withShare.filter((device) => device.groupId === group.id);
    const groupTotal = groupDevices.reduce(addEstimate, emptyEstimate());
    return {
      id: group.id,
      name: group.name,
      isDefault: group.id === DEFAULT_GROUP_ID,
      total: groupTotal,
      share: total.monthlyKwh ? groupTotal.monthlyKwh / total.monthlyKwh : 0,
      deviceCount: groupDevices.length,
      devices: groupDevices.map((device) => ({
        ...device,
        share: groupTotal.monthlyKwh ? device.monthlyKwh / groupTotal.monthlyKwh : 0,
      })),
    };
  });
  const ranked = groups.slice().sort((a, b) => b.total.monthlyKwh - a.total.monthlyKwh);
  const topGroup = ranked.find((group) => group.total.monthlyKwh > 0)
    ?? ranked.find((group) => group.deviceCount > 0)
    ?? ranked.find((group) => group.isDefault)
    ?? ranked[0]
    ?? null;

  return {
    total,
    devices: withShare,
    groups,
    topGroup,
  };
}

export function validateDevice(device: Pick<EnergyDevice, 'name' | 'watts' | 'dailyHours'>): string | null {
  if (!device.name.trim()) return '请填写设备名称';
  if (!Number.isFinite(device.watts) || device.watts < 0) return '功率不能为负数';
  if (!Number.isFinite(device.dailyHours) || device.dailyHours < 0) return '使用时间不能为负数';
  if (device.dailyHours > MAX_DAILY_HOURS) return '每日使用时间不能超过 24 小时';
  return null;
}

export function validateGroupName(name: string): string | null {
  if (!name.trim()) return '请填写分组名称';
  if (name.trim().length > MAX_GROUP_NAME_LENGTH) return `分组名称不能超过 ${MAX_GROUP_NAME_LENGTH} 个字`;
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
  const normalized = normalizeScenario(source);
  const idMap = new Map<string, string>(normalized.groups!.map((group) => [
    group.id,
    group.id === DEFAULT_GROUP_ID ? DEFAULT_GROUP_ID : `${id}-${group.id}`,
  ]));
  return {
    ...normalized,
    id,
    name,
    createdAt: new Date().toISOString(),
    groups: normalized.groups!.map((group) => ({ ...group, id: idMap.get(group.id) ?? group.id })),
    devices: normalized.devices.map((device) => ({
      ...device,
      id: `${id}-${device.id}`,
      groupId: idMap.get(device.groupId ?? DEFAULT_GROUP_ID) ?? DEFAULT_GROUP_ID,
    })),
  };
}
