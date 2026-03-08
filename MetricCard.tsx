
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, subValue, trend }) => {
  return (
    <div className="bg-white p-5 rounded-xl border border-border-light shadow-soft hover:shadow-md transition-shadow">
      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">{label}</p>
      <div className="flex flex-col">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-slate-900">{value}</span>
          {trend && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
              trend === 'up' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
            }`}>
              {trend === 'up' ? '+High' : '-Risk'}
            </span>
          )}
        </div>
        {subValue && (
          <span className="text-[10px] text-text-muted font-medium mt-1 uppercase tracking-tighter">
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
};
