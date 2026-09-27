// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import App from '../App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function renderApp() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<StrictMode><App /></StrictMode>);
  });
  return container;
}

describe('App smoke render', () => {
  beforeEach(() => localStorage.clear());

  it('renders a legacy document without groups entirely inside the default group', async () => {
    const legacy = {
      version: 1 as const,
      activeScenarioId: 'legacy-s',
      scenarios: [{
        id: 'legacy-s', name: '老方案', pricePerKwh: 0.6, daysPerMonth: 30,
        createdAt: '2025-01-01T00:00:00.000Z',
        devices: [
          { id: 'd1', name: '客厅空调', watts: 1000, dailyHours: 4 },
          { id: 'd2', name: '厨房冰箱', watts: 200, dailyHours: 12 },
        ],
      }],
    };
    localStorage.setItem('energy-lens.document.v1', JSON.stringify(legacy));
    const container = await renderApp();
    const text = container.textContent ?? '';
    expect(text).toContain('默认组');
    expect(text).toContain('192.00');
    expect(text).toContain('用电最集中的分组');
    expect(text).toContain('新建分组');
    // 旧设备明细原样出现
    expect(text).toContain('客厅空调');
    expect(text).toContain('厨房冰箱');
  });

  it('renders the grouped example scenario with group subtotals and top-group insight', async () => {
    const container = await renderApp();
    const text = container.textContent ?? '';
    expect(text).toContain('客厅');
    expect(text).toContain('厨房');
    expect(text).toContain('分组用电小计');
    expect(text).toContain('用电最集中的分组');
  });

  it('supports creating a group, moving a device into it, and removing it safely', async () => {
    const container = await renderApp();

    await act(async () => {
      (container.querySelector('.add-group-button') as HTMLButtonElement).click();
    });
    const input = container.querySelector('.group-create-row input') as HTMLInputElement;
    await act(async () => {
      setNativeValue(input, '书房');
    });
    await act(async () => {
      (container.querySelector('.group-create-row .group-action.confirm') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('书房');

    // 把台灯归到书房
    const lampRow = Array.from(container.querySelectorAll<HTMLElement>('.device-row'))
      .find((row) => (row.querySelector('.device-name input') as HTMLInputElement)?.value === '书桌台灯')!;
    const lampSelect = lampRow.querySelector('select') as HTMLSelectElement;
    const option = Array.from(lampSelect.options).find((item) => item.textContent === '书房')!;
    await act(async () => {
      setNativeValue(lampSelect, option.value);
    });
    expect(lampSelect.value).toBe(option.value);

    // 删除书房，台灯应回到默认组
    const blocks = container.querySelectorAll('.group-block');
    const studyBlock = Array.from(blocks).find((block) => block.querySelector('strong')?.textContent === '书房')!;
    await act(async () => {
      (studyBlock.querySelector('.group-action.danger') as HTMLButtonElement).click();
    });
    const defaultBlock = Array.from(container.querySelectorAll<HTMLElement>('.group-block')).find((block) => block.classList.contains('is-default'))!;
    const deviceNames = Array.from(defaultBlock.querySelectorAll<HTMLInputElement>('.device-name input')).map((item) => item.value);
    expect(deviceNames).toContain('书桌台灯');
    const groupHeaders = Array.from(container.querySelectorAll('.group-block-head strong')).map((item) => item.textContent);
    expect(groupHeaders).not.toContain('书房');
  });
});
