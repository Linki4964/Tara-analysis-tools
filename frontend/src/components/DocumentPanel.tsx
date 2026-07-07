import { UploadCloud } from 'lucide-react';
import type { ItemDefinition, UploadedDocument } from '../types/tara';

type Props = {
  projectName: string;
  systemDescription: string;
  optionalInfo: string;
  document: UploadedDocument | null;
  items: ItemDefinition[];
  busy: boolean;
  onProjectNameChange: (value: string) => void;
  onSystemDescriptionChange: (value: string) => void;
  onOptionalInfoChange: (value: string) => void;
  onUpload: (file: File) => void;
  onExtractItems: () => void;
};

export function DocumentPanel({
  projectName,
  systemDescription,
  optionalInfo,
  document,
  items,
  busy,
  onProjectNameChange,
  onSystemDescriptionChange,
  onOptionalInfoChange,
  onUpload,
  onExtractItems
}: Props) {
  return (
    <section className="panel-grid">
      <div className="work-panel">
        <label className="field-label">项目名称</label>
        <input value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} placeholder="例如：智能座舱 TARA" />

        <label className="field-label">系统描述</label>
        <textarea
          value={systemDescription}
          onChange={(event) => onSystemDescriptionChange(event.target.value)}
          placeholder="输入系统架构、接口、ECU、通信链路和关键功能"
          rows={10}
        />

        <label className="field-label">补充信息</label>
        <textarea
          value={optionalInfo}
          onChange={(event) => onOptionalInfoChange(event.target.value)}
          placeholder="可填写约束、假设、边界条件或已有安全机制"
          rows={4}
        />
      </div>

      <div className="work-panel">
        <label className="upload-zone">
          <UploadCloud size={28} />
          <span>{document ? document.metadata.filename : '上传需求文档'}</span>
          <input
            type="file"
            accept=".docx,.pdf,.txt,.json,.md,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
        </label>

        <button className="primary-button" type="button" onClick={onExtractItems} disabled={!document || busy}>
          识别相关项
        </button>

        <div className="summary-strip">
          <span>{document ? `${document.metadata.charCount} 字符` : '未上传'}</span>
          <span>{items.length} 个相关项</span>
        </div>

        <div className="result-list">
          {items.map((item) => (
            <article className="result-row" key={item.itemId}>
              <strong>{item.itemName}</strong>
              <small>{item.itemId}</small>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
