import React, { useState } from 'react';
import { Copy, Check, Terminal, Sparkles } from 'lucide-react';
import MagneticButton from '../components/MagneticButton';

const COMMAND = 'npm install -g gitsense-cli';

export default function CTA() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section id="cta" className="relative py-28 border-t border-white/[0.05] overflow-hidden">
      {/* Large centred ambient glow */}
      <div className="glow-blur glow-purple w-[700px] h-[400px] -bottom-32 left-1/2 -translate-x-1/2 opacity-25 pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="gitsense-card spotlight-border max-w-3xl mx-auto text-center flex flex-col items-center gap-8 px-8 py-14"
          style={{ borderColor: 'rgba(124,92,255,0.25)' }}>

          {/* Corner accent */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[#00D4FF]/8 to-[#7C5CFF]/8 blur-3xl pointer-events-none rounded-br-2xl" />

          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/25 text-[#7C5CFF] flex items-center justify-center">
            <Sparkles size={24} className="animate-pulse" />
          </div>

          {/* Copy */}
          <div className="flex flex-col gap-3 max-w-lg">
            <h2 className="text-slate-100">Get Started with GitSense AI</h2>
            <p className="text-slate-400 text-[1.0625rem] leading-relaxed">
              Say goodbye to branch fear and merge anxiety. Link your project in seconds.
            </p>
          </div>

          {/* Terminal command strip */}
          <div className="w-full max-w-md bg-slate-950/90 border border-white/[0.08] rounded-2xl px-5 py-4 flex items-center gap-4">
            <Terminal size={15} className="text-[#00D4FF] flex-shrink-0" />
            <code className="flex-1 text-sm text-slate-200 font-mono text-left select-all">{COMMAND}</code>
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              className={`flex-shrink-0 p-2 rounded-xl border transition-all duration-200 ${
                copied
                  ? 'bg-[#00E38C]/10 border-[#00E38C]/50 text-[#00E38C]'
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/[0.18]'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <MagneticButton
              className="btn btn-primary"
              onClick={() => window.open('https://github.com/mrsameer12082006-spec/GitSense-AI---A-Real-Time-AI-Powered-Git-Mentor', '_blank')}
            >
              View on GitHub
            </MagneticButton>
            <span className="text-xs text-slate-500 font-mono">Git 2.24+ · Node.js 18+ · MIT License</span>
          </div>

        </div>
      </div>
    </section>
  );
}
