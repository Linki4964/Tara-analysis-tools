import { FileSearch, ShieldCheck, Route, Wrench, Boxes } from 'lucide-react';

const steps = [
  { label: '文档', icon: FileSearch },
  { label: '资产', icon: Boxes },
  { label: '威胁', icon: ShieldCheck },
  { label: '路径', icon: Route },
  { label: '处置', icon: Wrench }
];

type Props = {
  currentStep: number;
  onSelect: (step: number) => void;
};

export function StepNav({ currentStep, onSelect }: Props) {
  return (
    <nav className="step-nav">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = currentStep === index;
        return (
          <button key={step.label} className={active ? 'step active' : 'step'} onClick={() => onSelect(index)} type="button">
            <Icon size={18} />
            <span>{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
