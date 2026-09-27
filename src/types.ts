export interface DeviceGroup {
  id: string;
  name: string;
}

export interface EnergyDevice {
  id: string;
  name: string;
  watts: number;
  dailyHours: number;
  groupId?: string;
}

export interface EnergyScenario {
  id: string;
  name: string;
  pricePerKwh: number;
  daysPerMonth: number;
  devices: EnergyDevice[];
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

export interface DeviceSummary extends EnergyDevice, EnergyEstimate {
  groupId: string;
  share: number;
  groupShare: number;
}

export interface GroupSummary extends EnergyEstimate {
  id: string;
  name: string;
  share: number;
  devices: DeviceSummary[];
}

export interface ScenarioSummary {
  total: EnergyEstimate;
  devices: DeviceSummary[];
  groups: GroupSummary[];
}
