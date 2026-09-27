export interface DeviceGroup {
  id: string;
  name: string;
}

export interface EnergyDevice {
  id: string;
  name: string;
  watts: number;
  dailyHours: number;
  /** 所属分组 id；旧数据缺省时由 normalizeScenario 归入默认组 */
  groupId?: string;
}

export interface EnergyScenario {
  id: string;
  name: string;
  pricePerKwh: number;
  daysPerMonth: number;
  devices: EnergyDevice[];
  /** 分组列表；旧数据缺省时由 normalizeScenario 补出默认组 */
  groups?: DeviceGroup[];
  createdAt: string;
}

export interface EnergyDocument {
  version: 1;
  scenarios: EnergyScenario[];
  activeScenarioId: string;
}

export type ViewStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
}

export interface EnergyEstimate {
  dailyKwh: number;
  monthlyKwh: number;
  monthlyCost: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  isDefault: boolean;
  total: EnergyEstimate;
  /** 该组占整个方案的用电比例 */
  share: number;
  deviceCount: number;
  devices: Array<EnergyDevice & EnergyEstimate & { share: number; groupId: string }>;
}

export interface ScenarioSummary {
  total: EnergyEstimate;
  devices: Array<EnergyDevice & EnergyEstimate & { share: number; groupId: string }>;
  groups: GroupSummary[];
  /** 用电最集中的组（月度 kWh 最高，含默认组） */
  topGroup: GroupSummary | null;
}
