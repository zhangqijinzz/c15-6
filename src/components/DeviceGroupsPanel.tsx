import { useState } from 'react';
import { DeviceEditor } from './DeviceEditor';
import { DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME } from '../domain';
import type { EnergyDevice, EnergyScenario } from '../types';

interface DeviceGroupsPanelProps {
  scenario: EnergyScenario;
  onUpdateDevice: (deviceId: string, patch: Partial<EnergyDevice>) => void;
  onRemoveDevice: (deviceId: string) => void;
  onAssignDevice: (deviceId: string, groupId: string) => void;
  onAddDevice: (groupId?: string) => void;
  onAddGroup: (name: string) => boolean;
  onRenameGroup: (groupId: string, name: string) => boolean;
  onRemoveGroup: (groupId: string) => void;
}

export function DeviceGroupsPanel({
  scenario,
  onUpdateDevice,
  onRemoveDevice,
  onAssignDevice,
  onAddDevice,
  onAddGroup,
  onRenameGroup,
  onRemoveGroup,
}: DeviceGroupsPanelProps) {
  const groups = scenario.groups ?? [{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME }];
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const submitCreate = () => {
    if (onAddGroup(newName)) {
      setNewName('');
      setCreating(false);
    }
  };

  const startRename = (groupId: string, name: string) => {
    setRenamingId(groupId);
    setRenameValue(name);
  };

  const submitRename = (groupId: string) => {
    if (onRenameGroup(groupId, renameValue)) setRenamingId(null);
  };

  return (
    <div className="device-groups">
      {groups.map((group) => {
        const members = scenario.devices.filter((device) => (device.groupId ?? DEFAULT_GROUP_ID) === group.id);
        const isDefault = group.id === DEFAULT_GROUP_ID;
        return (
          <section className={`group-block ${isDefault ? 'is-default' : ''}`} key={group.id}>
            <header className="group-block-head">
              <span className="group-block-dot" />
              {renamingId === group.id ? (
                <input
                  className="group-name-input"
                  autoFocus
                  value={renameValue}
                  maxLength={12}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitRename(group.id);
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <strong>{group.name}</strong>
              )}
              <em>{members.length} 台</em>
              {renamingId === group.id ? (
                <span className="group-actions">
                  <button className="group-action confirm" onClick={() => submitRename(group.id)}>确定</button>
                  <button className="group-action" onClick={() => setRenamingId(null)}>取消</button>
                </span>
              ) : (
                <span className="group-actions">
                  {!isDefault && <button className="group-action" onClick={() => startRename(group.id, group.name)}>重命名</button>}
                  {!isDefault && <button className="group-action danger" onClick={() => onRemoveGroup(group.id)}>删除</button>}
                  {isDefault && <span className="default-hint">未归组设备自动进入这里</span>}
                </span>
              )}
            </header>
            {members.length > 0 ? (
              members.map((device) => (
                <DeviceEditor
                  key={device.id}
                  device={device}
                  groups={groups}
                  onChange={(patch) => onUpdateDevice(device.id, patch)}
                  onAssign={(groupId) => onAssignDevice(device.id, groupId)}
                  onRemove={() => onRemoveDevice(device.id)}
                />
              ))
            ) : (
              <p className="group-empty-row">暂无设备{isDefault ? '' : '，新设备或删除分组后的设备会进入默认组'}</p>
            )}
            <button className="add-device group-add-device" onClick={() => onAddDevice(group.id)}><span>＋</span> 在该组添加设备</button>
          </section>
        );
      })}

      {creating ? (
        <div className="group-create-row">
          <input
            placeholder="输入分组名称，如：客厅、厨房"
            maxLength={12}
            value={newName}
            autoFocus
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate();
              if (event.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
          />
          <button className="group-action confirm" onClick={submitCreate}>创建</button>
          <button className="group-action" onClick={() => { setCreating(false); setNewName(''); }}>取消</button>
        </div>
      ) : (
        <button className="add-group-button" onClick={() => setCreating(true)}><span>＋</span> 新建分组</button>
      )}
    </div>
  );
}
