import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Bot,
  CarFront,
  CircleHelp,
  FileSearch,
  Loader2,
  Mic,
  MonitorSmartphone,
  Paperclip,
  Router,
  Send,
  Settings,
  Shield,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { taraApi } from '../api/taraApi';

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  project?: { runId: string; name: string }; // auto-created project
};

const SCENARIOS = [
  {
    icon: CarFront,
    title: '车辆远程控制系统',
    desc: '创建分析项目，识别远程控制链路上的资产与威胁',
    prompt: '创建一个车辆远程控制系统的分析项目',
    tint: 'blue',
  },
  {
    icon: MonitorSmartphone,
    title: '车载娱乐系统',
    desc: '创建分析项目，梳理系统边界、数据流与外部接口',
    prompt: '创建一个车载娱乐系统的分析项目',
    tint: 'indigo',
  },
  {
    icon: Router,
    title: 'TBOX 网关',
    desc: '新建网关项目，分析远程通信与诊断接口的潜在风险',
    prompt: '帮我新建一个 TBOX 网关项目',
    tint: 'blue',
  },
  {
    icon: FileSearch,
    title: '智能座舱系统',
    desc: '创建智能座舱分析项目，覆盖中控、仪表与语音交互',
    prompt: '创建一个智能座舱系统的分析项目',
    tint: 'indigo',
  },
];

const GENERIC_REPLY =
  '已收到你的需求 ✅\nAI 智能分析功能正在开发中，即将上线。你可以先通过下方按钮手动开始。';

/** Try to extract a project name from a creation request, e.g. "创建一个XX项目". */
function parseProjectRequest(text: string): string | null {
  if (!/项目/.test(text)) return null;
  const m = text.match(/(?:创建|新建|做|搞|建立|启动|开始|帮我)(?:一个|个)?(.+?)(?:的)?(?:分析|评估|威胁)?项目/);
  const raw = m ? m[1] : text;
  let name = raw
    .replace(/(?:的)?(?:威胁分析与风险评估|威胁分析|风险评估|风险分析|分析|评估|项目)$/i, '')
    .replace(/[，。,.！!、\s]+$/g, '')
    .replace(/的$/, '')
    .trim();
  if (!name) name = '未命名项目';
  return name.slice(0, 30);
}

function projectNo(runId: string) {
  return `PRJ-${runId.slice(0, 8).toUpperCase()}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = '';
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || thinking) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content }]);
    setInput('');
    setThinking(true);

    const name = parseProjectRequest(content);

    if (!name) {
      window.setTimeout(() => {
        setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: GENERIC_REPLY }]);
        setThinking(false);
      }, 700);
      return;
    }

    let reply: string;
    let project: ChatMessage['project'];
    try {
      const res = await taraApi.createRun({ projectName: name });
      if (res.runId) {
        project = { runId: res.runId, name };
        reply = `已为你自动创建项目「${name}」✅\n项目编号：${projectNo(res.runId)}\n现在可以进入项目，绘制资产结构图或直接开始 TARA 分析。`;
      } else {
        reply = '项目创建失败：数据库暂不可用。你可以点击下方按钮手动创建项目。';
      }
    } catch {
      reply = '项目创建失败：数据库暂不可用。你可以点击下方按钮手动创建项目。';
    }

    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, role: 'assistant', content: reply, project },
    ]);
    setThinking(false);
  }

  return (
    <div className="nexus-home">
      {/* TopNavBar */}
      <header className="nexus-topbar">
        <div className="nexus-topbar-left">
          <span className="nexus-topbar-brand"><Shield size={16} /> TARA AI</span>
        </div>
        <div className="nexus-topbar-right">
          <button className="nexus-topbar-btn" type="button" title="通知">
            <Bell size={18} />
          </button>
          <button className="nexus-topbar-btn" type="button" title="帮助">
            <CircleHelp size={18} />
          </button>
          <button className="nexus-topbar-btn" type="button" title="设置" onClick={() => navigate('/settings')}>
            <Settings size={18} />
          </button>
          <div className="nexus-avatar" title="当前用户">TA</div>
        </div>
      </header>

      {/* Chat Canvas */}
      <main className="nexus-canvas">
        <div className="nexus-inner">
          {messages.length === 0 && !thinking ? (
            <>
              {/* Welcome Header */}
              <div className="nexus-welcome">
                <div className="nexus-welcome-icon">
                  <Shield size={30} />
                </div>
                <h2 className="nexus-welcome-title">让我们开始吧！！！</h2>
                <p className="nexus-welcome-sub">
                  告诉 AI 你想创建的 TARA 分析项目，我将立即为你创建并推进威胁分析与风险评估
                </p>
              </div>

              {/* Suggested Scenarios (Bento grid) */}
              <div className="nexus-bento">
                {SCENARIOS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.title}
                      className={`nexus-bento-card nexus-bento-card--${s.tint}`}
                      type="button"
                      onClick={() => void sendMessage(s.prompt)}
                    >
                      <span className="nexus-bento-blob" />
                      <span className="nexus-bento-icon"><Icon size={20} /></span>
                      <span className="nexus-bento-title">{s.title}</span>
                      <span className="nexus-bento-desc">{s.desc}</span>
                      <span className="nexus-bento-try">试试这个 <ArrowRight size={14} /></span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="nexus-messages" ref={chatRef}>
              {messages.map((msg) => (
                <div key={msg.id} className={`nexus-msg nexus-msg--${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <span className="nexus-msg-badge"><Bot size={13} /> AI 助手</span>
                  )}
                  <div className="nexus-msg-content">{msg.content}</div>

                  {msg.project && (
                    <div className="nexus-msg-actions">
                      <button
                        className="nexus-msg-btn nexus-msg-btn--primary"
                        type="button"
                        onClick={() => navigate(`/diagram/${msg.project!.runId}`)}
                      >
                        <Workflow size={14} /> 打开结构图
                      </button>
                      <button
                        className="nexus-msg-btn"
                        type="button"
                        onClick={() => navigate('/workspace', { state: { loadRunId: msg.project!.runId } })}
                      >
                        <Sparkles size={14} /> 开始 TARA 分析
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {thinking && (
                <div className="nexus-msg nexus-msg--assistant">
                  <span className="nexus-msg-badge"><Bot size={13} /> AI 助手</span>
                  <div className="nexus-typing">
                    <Loader2 className="spinner-icon" size={15} />
                    <span>正在为你创建项目…</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Floating Input Area */}
      <div className="nexus-inputbar">
        <div className="nexus-input-wrap">
          <button className="nexus-input-btn" type="button" disabled title="上传文件（开发中）">
            <Paperclip size={18} />
          </button>
          <textarea
            ref={inputRef}
            className="nexus-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="告诉 AI 你想创建的项目…（Shift+Enter 换行）"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button className="nexus-input-btn" type="button" disabled title="语音输入（开发中）">
            <Mic size={18} />
          </button>
          <button
            className="nexus-send"
            type="button"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || thinking}
            title="发送"
          >
            {thinking ? <Loader2 className="spinner-icon" size={18} /> : <Send size={18} />}
          </button>
        </div>
        <p className="nexus-disclaimer">AI 助手可能在分析过程中出错，请核对关键信息。</p>
      </div>
    </div>
  );
}
