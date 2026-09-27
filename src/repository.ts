import { exampleScenario, normalizeScenario } from './domain';
import { readDocument, writeDocument } from './services/storageService';
import type { EnergyDocument, EnergyScenario } from './types';

export interface EnergyRepository {
  load(): EnergyDocument;
  save(document: EnergyDocument): void;
}

export class LocalEnergyRepository implements EnergyRepository {
  load(): EnergyDocument {
    const saved = readDocument();
    if (!saved || saved.scenarios.length === 0) {
      return { version: 1, scenarios: [exampleScenario], activeScenarioId: exampleScenario.id };
    }
    // 旧方案没有分组信息时，归一化会补出默认组并归入全部设备，明细与总用电保持不变
    const scenarios = saved.scenarios.map(normalizeScenario);
    const document = { ...saved, scenarios };
    const activeExists = scenarios.some((scenario) => scenario.id === saved.activeScenarioId);
    return activeExists ? document : { ...document, activeScenarioId: scenarios[0].id };  }

  save(document: EnergyDocument): void {
    writeDocument(document);
  }
}

export function findScenario(document: EnergyDocument, id: string): EnergyScenario | undefined {
  return document.scenarios.find((scenario) => scenario.id === id);
}
