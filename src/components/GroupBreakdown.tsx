import { formatNumber } from '../domain';
import type { GroupSummary } from '../types';

interface GroupBreakdownProps {
  groups: GroupSummary[];
}

export function GroupBreakdown({ groups }: GroupBreakdownProps) {
  const maxKwh = Math.max(...groups.map((group) => group.total.monthlyKwh), 1);
  return (
    <div className="chart-card group-breakdown">
      <div className="card-heading">
        <div><h3>分组用电小计</h3><p>各组月度用电、占比与组内构成</p></div>
        <span className="legend"><i /> 月度 kWh</span>
      </div>
      <div className="group-summary-grid">
        {groups.map((group) => (
          <article className={`group-summary-card ${group.isDefault ? 'default' : ''}`} key={group.id}>
            <header>
              <span className="group-tag">{group.isDefault && <i>默认</i>}{group.name}</span>
              <b>{Math.round(group.share * 100)}%</b>
            </header>
            <strong>{formatNumber(group.total.monthlyKwh)} <small>kWh / 月</small></strong>
            <em>约 ¥{formatNumber(group.total.monthlyCost)} · {group.deviceCount} 台设备</em>
            <div className="group-bar-track"><i style={{ width: `${(group.total.monthlyKwh / maxKwh) * 100}%` }} /></div>
            {group.devices.length > 0 ? (
              <ul className="group-members">
                {group.devices.slice().sort((a, b) => b.monthlyKwh - a.monthlyKwh).map((device) => (
                  <li key={device.id}><span>{device.name}</span><b>{Math.round(device.share * 100)}% · {formatNumber(device.monthlyKwh)} kWh</b></li>
                ))}
              </ul>
            ) : (
              <p className="group-empty">分组还是空的，把设备归进来或选择默认组</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
