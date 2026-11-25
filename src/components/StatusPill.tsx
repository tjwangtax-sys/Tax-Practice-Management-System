import React from 'react';
import { useData } from '../context/DataContext';

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

  // Explicit corporate workflow styling: Pending MITRS (light-blue) & Completed (bright yellow #fef08a / #ca8a04)
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
    normalized === 'completed' &&
    (group === 'JOB_STATUS' ||
      group === 'CORP_STATUS' ||
      group === 'INDIV_STATUS' ||
      group === 'FORM_E_STATUS' ||
      group === 'CP204_STATUS')
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
