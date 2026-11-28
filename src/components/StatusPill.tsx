import React from 'react';
import { useData } from '../context/DataContext';
import { normalizeSettingGroup } from '../lib/settingsDropdown';

interface StatusPillProps {
  group: string;
  value: string | undefined | null;
  customColor?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export const StatusPill: React.FC<StatusPillProps> = ({ group, value, customColor }) => {
  const { resolveSettingBadge } = useData();
  const resolved = customColor
    ? { label: value || '—', color: customColor }
    : resolveSettingBadge(group, value);

  if (!value) {
    return <span className="text-slate-400 text-xs">—</span>;
  }

  const normalized = value.trim().toLowerCase();

  // Explicit corporate workflow styling: Pending MITRS (light-blue), SME Exempted (soft green/teal), & Completed (bright yellow)
  if (!customColor && normalized === 'pending mitrs') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight whitespace-nowrap"
        style={{
          backgroundColor: '#e0f2fe',
          borderColor: '#bae6fd',
          borderWidth: '1px',
          color: '#0369a1',
        }}
      >
        {resolved.label || 'Pending MITRS'}
      </span>
    );
  }

  if (
    !customColor &&
    (normalized === 'sme exempted' ||
      normalized === 'sme exempt' ||
      normalized === 'sme 2-yr exempt')
  ) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight whitespace-nowrap"
        style={{
          backgroundColor: '#ecfdf5',
          borderColor: '#a7f3d0',
          borderWidth: '1px',
          color: '#047857',
        }}
      >
        {resolved.label || value}
      </span>
    );
  }

  const normalizedGroup = normalizeSettingGroup(group);

  if (
    !customColor &&
    normalized === 'completed' &&
    (normalizedGroup === 'JOB STATUS' ||
      normalizedGroup === 'CORP STATUS' ||
      normalizedGroup === 'INDIV STATUS' ||
      normalizedGroup === 'FORM E STATUS' ||
      normalizedGroup === 'CP204 STATUS' ||
      normalizedGroup === 'CP204 SUBMISSION STATUS' ||
      normalizedGroup === 'CP204A REVISIONS SUBMISSION STATUS')
  ) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight whitespace-nowrap"
        style={{
          backgroundColor: '#fef08a',
          borderColor: '#ca8a04',
          borderWidth: '1px',
          color: '#ca8a04',
        }}
      >
        {resolved.label || 'Completed'}
      </span>
    );
  }

  const rgb = hexToRgb(resolved.color) ?? { r: 71, g: 85, b: 105 };
  const bg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.11)`;
  const border = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight whitespace-nowrap"
      style={{
        backgroundColor: bg,
        borderColor: border,
        borderWidth: '1px',
        color: resolved.color,
      }}
    >
      {resolved.label}
    </span>
  );
};
