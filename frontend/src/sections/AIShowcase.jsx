import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Sparkles, Send, Mic, Volume2 } from 'lucide-react';

const PRESETS = {
  merge: {
    question: 'Can I safely merge my local auth branch into main?',
    responses: [
      { type: 'text', text: 'Analyzing repository state...' },
      { type: 'text', text: 'Compared local branch `feature/auth` against `main`.' },
      { type: 'html', html: '<strong>Divergence Check:</strong> Remote <code>origin/main</code> is ahead by 2 commits — includes updates to <code>middleware/cors.js</code>.' },
      { type: 'text', text: '⚠️ Conflict risk: CORS config has been modified in both branches. Merging now will cause a conflict in config/cors.js.' },
      { type: 'cmd',  cmd: 'git pull origin main', desc: 'Pull latest remote commits first, resolve the CORS block, then execute the merge.' }
    ]
  },
  pull: {
    question: 'Should I pull before pushing my changes?',
    responses: [
      { type: 'text', text: 'Checking origin sync status...' },
      { type: 'text', text: 'Yes — your local repo is behind `origin/main` by 3 commits.' },
      { type: 'text', text: 'Pushing now will be rejected (non-fast-forward). Teammates merged changes to `server.js`.' },
      { type: 'cmd',  cmd: 'git pull --rebase origin main', desc: 'Replay your commits on top of origin. Keeps history linear, avoids a merge commit.' }
    ]
  },
  why: {
    question: 'Why is my current merge command failing?',
    responses: [
      { type: 'text', text: 'Reading merge failure logs...' },
      { type: 'text', text: 'Merge is failing due to uncommitted changes in your working directory.' },
      { type: 'text', text: 'Affected file: `src/components/Navbar.jsx`. Git stops the merge to protect your work.' },
      { type: 'cmd',  cmd: 'git stash', desc: "Stash local edits, run the merge, then restore via 'git stash pop'." }
    ]
  }
};

const TABS = [
  { id: 'merge', label: '"Can I safely merge this branch?"',    tag: 'Merge Safety' },
  { id: 'pull',  label: '"Should I pull before pushing?"',      tag: 'Push Sync'    },
  { id: 'why',   label: '"Why is my merge command failing?"',   tag: 'Debugging'    },
];

export default function AIShowcase() {
  const [tab, setTab] = useState('merge');
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([{ sender: 'user', ...PRESETS[tab].responses[0], text: PRESETS[tab].question }]);
    setTyping(true);
    let idx = 0;
    const timer = setInterval(() => {
      const next = PRESETS[tab].responses[idx];
      if (next) {
        setMessages(prev => [...prev, { sender: 'ai', ...next }]);
        idx++;
      } else {
        setTyping(false);
        clearInterval(timer);
      }
    }, 1100);
    return () => clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  return (
    <section id="ai-mentor" className="relative py-24 border-t border-white/[0.05] overflow-hidden">
      <div className="glow-blur glow-purple w-[400px] h-[400px] bottom-0 -left-20 pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

          {/* Left column */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="badge bg-[#7C5CFF]/10 border-[#7C5CFF]/30 text-[#7C5CFF]">
              <Sparkles size={11} /> COGNITIVE GIT ASSISTANT
            </div>
            <h2 className="text-slate-100 leading-tight">A Real-Time Git Mentor at Your Side</h2>
            <p className="text-slate-400 text-[1.0625rem] leading-relaxed">
              Speak or type questions. GitSense AI crawls branches, histories, and local working trees
              to give plain-English answers — not confusing git errors.
            </p>

            {/* Preset buttons */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-1">
                Simulate a question
              </span>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center justify-between text-left py-3 px-4 rounded-xl border text-xs font-heading font-semibold
                    transition-all duration-200
                    ${tab === t.id
                      ? 'bg-[#7C5CFF]/10 border-[#7C5CFF] text-slate-100'
                      : 'bg-white/[0.02] border-white/[0.07] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
                    }`}
                >
                  <span>{t.label}</span>
                  <span className="text-[10px] font-normal font-mono text-slate-500 ml-3 whitespace-nowrap">{t.tag}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right column — Chat */}
          <div className="lg:col-span-7">
            <div className="gitsense-card spotlight-border p-0 flex flex-col h-[500px]">

              {/* Chat header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#7C5CFF]/10 text-[#7C5CFF] flex items-center justify-center flex-shrink-0">
                    <Bot size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-heading font-bold text-slate-100 leading-none mb-1">GitSense Mentor</p>
                    <span className="text-[10px] font-mono text-[#00E38C] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E38C] animate-pulse" />
                      indexing local.git
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[Mic, Volume2].map((Icon, i) => (
                    <button key={i} className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-white/5 transition-colors">
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => {
                    const isUser = msg.sender === 'user';
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`flex gap-2.5 max-w-[88%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center
                          ${isUser ? 'bg-[#00D4FF]/10 text-[#00D4FF]' : 'bg-[#7C5CFF]/10 text-[#7C5CFF]'}`}>
                          {isUser ? <User size={13} /> : <Bot size={13} />}
                        </div>
                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
                          ${isUser
                            ? 'bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-slate-100 rounded-tr-none'
                            : 'bg-white/[0.04] border border-white/[0.07] text-slate-300 rounded-tl-none'
                          }`}>
                          {msg.type === 'html'
                            ? <span dangerouslySetInnerHTML={{ __html: msg.html }} />
                            : <span>{msg.text}</span>
                          }
                          {msg.type === 'cmd' && (
                            <div className="mt-3 bg-slate-950/80 border border-[#7C5CFF]/20 rounded-xl p-3 flex flex-col gap-1.5">
                              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider font-semibold">Suggested command</span>
                              <span className="font-mono text-xs text-[#00D4FF] font-bold">{msg.cmd}</span>
                              {msg.desc && <span className="text-[11px] text-slate-400 font-sans border-t border-slate-900 pt-1.5 mt-0.5 leading-relaxed">{msg.desc}</span>}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  {typing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-2.5 self-start"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#7C5CFF]/10 text-[#7C5CFF] flex items-center justify-center flex-shrink-0">
                        <Bot size={13} />
                      </div>
                      <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-white/[0.04] border border-white/[0.07] flex gap-1.5 items-center">
                        {[0, 150, 300].map(delay => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF] animate-bounce"
                            style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="border-t border-white/[0.06] p-4 flex items-center gap-3 bg-white/[0.01]">
                <input
                  type="text"
                  placeholder="Ask a Git question..."
                  disabled
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm
                             text-slate-400 placeholder-slate-600 focus:outline-none cursor-not-allowed"
                />
                <button className="p-2.5 bg-[#7C5CFF]/40 text-white/50 rounded-xl flex-shrink-0 cursor-not-allowed">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
