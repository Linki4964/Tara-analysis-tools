import type { Asset, AttackPath, RiskTreatment, Threat } from '../types/tara';
import type { ReactNode } from 'react';

type Props = {
  assets: Asset[];
  threats: Threat[];
  attackPaths: AttackPath[];
  riskTreatments: RiskTreatment[];
  busy: boolean;
  onGenerateAssets: () => void;
  onAnalyzeThreats: () => void;
  onGenerateAttackPaths: () => void;
  onGenerateRiskTreatment: () => void;
};

export function AnalysisPanel({
  assets,
  threats,
  attackPaths,
  riskTreatments,
  busy,
  onGenerateAssets,
  onAnalyzeThreats,
  onGenerateAttackPaths,
  onGenerateRiskTreatment
}: Props) {
  return (
    <section className="analysis-grid">
      <Column title="资产识别" count={assets.length} action="生成资产" busy={busy} onAction={onGenerateAssets}>
        {assets.map((asset) => (
          <article className="result-row" key={asset.assetName}>
            <strong>{asset.assetName}</strong>
            <small>{asset.assetType}</small>
            <p>{asset.description}</p>
          </article>
        ))}
      </Column>

      <Column title="威胁分析" count={threats.length} action="分析威胁" busy={busy || assets.length === 0} onAction={onAnalyzeThreats}>
        {threats.map((threat) => (
          <article className="result-row" key={threat.threatId}>
            <strong>{threat.threatName}</strong>
            <small>{threat.threatId} · {threat.strideCategory}</small>
            <p>{threat.description}</p>
          </article>
        ))}
      </Column>

      <Column title="攻击路径" count={attackPaths.length} action="生成路径" busy={busy || threats.length === 0} onAction={onGenerateAttackPaths}>
        {attackPaths.map((path) => (
          <article className="result-row" key={path.attackPathId}>
            <strong>{path.attackPathName}</strong>
            <small>{path.attackPathId} · {path.attackFeasibility}</small>
            <p>{path.entryPoint}</p>
          </article>
        ))}
      </Column>

      <Column title="风险处置" count={riskTreatments.length} action="生成处置" busy={busy || attackPaths.length === 0} onAction={onGenerateRiskTreatment}>
        {riskTreatments.map((treatment) => (
          <article className="result-row" key={treatment.treatmentId}>
            <strong>{treatment.controlName}</strong>
            <small>{treatment.treatmentId} · {treatment.implementationPriority}</small>
            <p>{treatment.controlDescription}</p>
          </article>
        ))}
      </Column>
    </section>
  );
}

type ColumnProps = {
  title: string;
  count: number;
  action: string;
  busy: boolean;
  onAction: () => void;
  children: ReactNode;
};

function Column({ title, count, action, busy, onAction, children }: ColumnProps) {
  return (
    <div className="work-panel analysis-column">
      <div className="column-header">
        <div>
          <h2>{title}</h2>
          <span>{count} 条</span>
        </div>
        <button type="button" onClick={onAction} disabled={busy}>
          {action}
        </button>
      </div>
      <div className="result-list">{children}</div>
    </div>
  );
}
