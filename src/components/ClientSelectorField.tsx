import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ClientRecord } from '../types/tpms';
import { extractFyeMonth } from '../lib/deadlineUtils';

export interface ClientSelectorFieldProps {
  clients: ClientRecord[];
  value: string;
  onSelectClient: (client: ClientRecord | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  selectPlaceholder?: string;
  filterClients?: (client: ClientRecord) => boolean;
}

export const ClientSelectorField: React.FC<ClientSelectorFieldProps> = ({
  clients,
  value,
  onSelectClient,
  label = 'Client',
  required = false,
  disabled = false,
  placeholder = 'Type client name or ID to narrow the list...',
  selectPlaceholder = '-- Select Client ID --',
  filterClients,
}) => {
  const [query, setQuery] = useState('');

  const scopedClients = useMemo(
    () => (filterClients ? clients.filter(filterClients) : clients),
    [clients, filterClients]
  );

  const narrowedClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? scopedClients.filter((c) => {
          const hay = [c.clientId, c.clientName, c.companyNo, c.tin]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : scopedClients;

    // Always keep the currently selected client visible even if it doesn't match the live search
    if (value && !matched.some((c) => c.clientId === value)) {
      const current = clients.find((c) => c.clientId === value);
      if (current) {
        return [current, ...matched];
      }
    }
    return matched;
  }, [scopedClients, clients, query, value]);

  const handleSelectChange = (selectedId: string) => {
    if (!selectedId) {
      onSelectClient(null);
      return;
    }
    const found = clients.find((c) => c.clientId === selectedId) ?? null;
    onSelectClient(found);
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[11px] font-medium text-slate-700">
          {label} {required ? <span className="text-rose-600">*</span> : null}
        </label>
      )}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-100"
        />
      </div>
      <select
        value={value}
        onChange={(e) => handleSelectChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-100"
      >
        <option value="">{selectPlaceholder}</option>
        {narrowedClients.map((c) => {
          const fyeNum = extractFyeMonth(c.fye);
          const fyeTag = fyeNum ? ` (FYE ${String(fyeNum).padStart(2, '0')})` : '';
          return (
            <option key={c.id} value={c.clientId}>
              {c.clientId} — {c.clientName}
              {fyeTag}
            </option>
          );
        })}
      </select>
    </div>
  );
};
