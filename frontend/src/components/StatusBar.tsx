import { Activity, KeyRound, Server } from 'lucide-react';
import type { Health } from '../types/tara';

type Props = {
  health: Health | null;
};

export function StatusBar({ health }: Props) {
  return (
    <div className="status-bar">
      <div className="status-item">
        <Activity size={16} />
        <span>{health?.status === 'ok' ? 'API Ready' : 'Checking API'}</span>
      </div>
      <div className="status-item">
        <Server size={16} />
        <span>{health?.provider || 'unknown'}</span>
      </div>
      <div className="status-item">
        <KeyRound size={16} />
        <span>{health?.hasApiKey ? health.model || 'configured' : 'no key'}</span>
      </div>
    </div>
  );
}
