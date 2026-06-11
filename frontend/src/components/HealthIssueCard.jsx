import React, { useState } from 'react';
import { ShieldAlert, Check, Copy, Loader2, CheckCircle2, X, ExternalLink, ChevronDown, Wand2, Terminal } from 'lucide-react';

// API base and headers helper matching App/Dashboard config
const API_BASE = '/api';
const getToken = () => localStorage.getItem('gitsense_token');

export default function HealthIssueCard({ issue, currentRepo, onVerify }) {
  const [mode, setMode] = useState('idle'); // idle | expanded | applying | done | error
  const [commitUrl, setCommitUrl] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleAIFix = async () => {
    setMode('applying');
    setErrorMsg(null);
    try {
      const token = getToken();

      // Special case: gitignore needs to be CREATED not updated
      if (issue.type === 'missing-gitignore' || issue.type === 'missing_gitignore' || issue.id === 'missing-gitignore' || issue.title.toLowerCase().includes('gitignore')) {
        const res = await fetch(`${API_BASE}/github/apply-fix`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            repoFullName: currentRepo,
            issueType: 'missing-gitignore',
            gitignoreTemplate: issue.gitignoreTemplate || 'default',
            issueTitle: issue.title
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setCommitUrl(data.commitUrl);
          setMode('done');
          if (onVerify) {
            onVerify();
          }
        } else {
          setErrorMsg(data.error || 'Failed to apply .gitignore fix.');
          setMode('error');
        }
        return;
      }

      // Normal fix flow for other issues
      let contentToApply = issue.resolvedContent;

      // If resolvedContent was not pre-generated, generate it now
      if (!contentToApply) {
        const aiRes = await fetch(`${API_BASE}/github/generate-fix`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            repoFullName: currentRepo,
            issueType: issue.type,
            filePath: issue.filePath,
            rootCause: issue.rootCause,
            issueTitle: issue.title
          })
        });
        const aiData = await aiRes.json();
        if (!aiRes.ok || !aiData.success) {
          setErrorMsg(aiData.error || 'Failed to generate AI fix.');
          setMode('error');
          return;
        }
        contentToApply = aiData.resolvedContent;
      }

      // Then apply the fix
      const res = await fetch(`${API_BASE}/github/apply-fix`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          repoFullName: currentRepo,
          filePath: issue.filePath,
          resolvedContent: contentToApply,
          issueTitle: issue.title,
          issueType: issue.type
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Fix failed. Please try again.');
        setMode('error');
        return;
      }

      setCommitUrl(data.commitUrl);
      setMode('done');
      if (onVerify) {
        onVerify();
      }
    } catch (err) {
      console.error('[HealthIssueCard] Auto-fix error:', err);
      setErrorMsg('Network error. Check your connection.');
      setMode('error');
    }
  };

  const severityConfig = {
    critical: { className: 'bg-rose-500/10 border-rose-500/20 text-rose-400', icon: '🔴', label: 'CRITICAL' },
    warning:  { className: 'bg-amber-500/10 border-amber-500/20 text-amber-400', icon: '🟡', label: 'WARNING' },
    info:     { className: 'bg-blue-500/10 border-blue-500/20 text-blue-400',   icon: 'ℹ️',  label: 'INFO' }
  };

  const severity = issue.severity || 'warning';
  const badge = severityConfig[severity] || severityConfig.warning;

  return (
    <div className={`gitsense-card bg-slate-950/80 border ${
      mode === 'done' 
        ? 'border-emerald-500/30' 
        : mode === 'error'
          ? 'border-rose-500/30'
          : 'border-white/[0.06]'
    } rounded-2xl p-5 text-left flex flex-col gap-4 transition-all duration-300 relative overflow-hidden`}>
      
      {/* Decorative Glow inside Done state */}
      {mode === 'done' && (
        <div className="absolute -right-20 -top-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* 1. Header (Severity Badge + Title) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase border ${badge.className}`}>
            {badge.icon} {badge.label}
          </span>
          <h4 className="text-slate-100 font-heading font-bold text-sm leading-snug">
            {issue.title || 'Repository Health Issue'}
          </h4>
        </div>
      </div>

      {/* 2. Root Cause Block (Always visible, no click) */}
      <div className="bg-slate-900/50 border border-white/[0.04] rounded-xl p-4 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-wider font-mono">
          Root Cause
        </span>
        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
          {issue.rootCause || 'Scanning details did not provide a root cause analysis.'}
        </p>
      </div>

      {/* 3. idle state: Fix Issue Button */}
      {mode === 'idle' && (
        <button
          onClick={() => setMode('expanded')}
          className="w-full py-2 bg-gradient-to-r from-[#7C5CFF] to-[#00D4FF] hover:opacity-90 active:scale-[0.99] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-lg shadow-purple-950/20"
        >
          <Wand2 size={13} /> Fix Issue
        </button>
      )}

      {/* 4. expanded state: Steps list + AI fix offer */}
      {mode === 'expanded' && (
        <div className="flex flex-col gap-4 border-t border-white/[0.05] pt-4 mt-1">
          {/* Steps List */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-[#7C5CFF] uppercase tracking-wider font-mono">
              Manual Resolution Steps
            </span>
            <div className="flex flex-col gap-2.5">
              {issue.steps && issue.steps.length > 0 ? (
                issue.steps.map((step, idx) => (
                  <div key={idx} className="bg-slate-900/40 border border-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2 text-[11px] text-slate-300 font-sans leading-relaxed">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 text-slate-400">
                        {idx + 1}
                      </span>
                      <span>{step.description}</span>
                    </div>
                    {step.command && (
                      <div className="flex items-center justify-between bg-black/40 border border-white/[0.05] rounded-lg p-2.5 pl-3 mt-1 gap-3 font-mono text-[10px] text-emerald-400 overflow-hidden">
                        <div className="flex items-center gap-1.5 truncate">
                          <Terminal size={11} className="text-slate-500 shrink-0" />
                          <code className="truncate select-all">{step.command}</code>
                        </div>
                        <button
                          onClick={() => handleCopy(step.command, idx)}
                          className="p-1 hover:bg-slate-800 border border-transparent hover:border-white/[0.08] rounded text-slate-400 hover:text-slate-200 shrink-0 transition-all cursor-pointer"
                        >
                          {copiedIndex === idx ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-slate-500 italic">No manual commands available.</p>
              )}
            </div>
          </div>

          <hr className="border-white/[0.05] my-1" />

          {/* AI Offer Text & Buttons */}
          <div className="flex flex-col gap-3 bg-gradient-to-br from-[#7C5CFF]/10 to-[#00D4FF]/5 border border-[#7C5CFF]/20 rounded-xl p-4">
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-200">
              <span className="text-base shrink-0 select-none">🤖</span>
              <span>Want me to fix this directly in your repository? I will apply the required changes and commit them automatically.</span>
            </div>
            
            <div className="flex gap-2.5 mt-1">
              <button
                onClick={handleAIFix}
                disabled={mode === 'applying'}
                className={
                  mode === 'applying'
                    ? "px-4 py-2 bg-slate-800 text-slate-500 opacity-50 pointer-events-none cursor-not-allowed rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all duration-200 flex-1"
                    : "px-4 py-2 bg-[#00E38C] hover:bg-[#00c57a] active:scale-95 opacity-100 cursor-pointer text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all duration-200 flex-1"
                }
                title={mode === 'applying' ? "Applying fix..." : "Fix this issue automatically"}
              >
                <Wand2 size={13} /> Fix Through AI
              </button>
              <button
                onClick={() => setMode('idle')}
                className="px-4 py-2 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 active:scale-95 text-slate-300 font-semibold rounded-lg text-xs transition-all duration-200 cursor-pointer"
              >
                I'll Do It Myself
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. applying state: loading spinner */}
      {mode === 'applying' && (
        <div className="bg-slate-900/60 border border-[#7C5CFF]/20 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-center pt-6 pb-6">
          <Loader2 className="animate-spin text-[#00D4FF]" size={24} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-200">Applying automated fix...</span>
            <span className="text-[9px] text-slate-400">GitSense AI is editing the file and committing it on GitHub.</span>
          </div>
        </div>
      )}

      {/* 6. done state: success + View Commit link */}
      {mode === 'done' && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-400 leading-normal">
            <CheckCircle2 size={15} />
            <span>Fix applied successfully!</span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            The changes have been committed directly to your repository main/default branch.
          </p>
          {commitUrl && (
            <a
              href={commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00D4FF] hover:underline flex items-center gap-1 font-bold text-[10px] mt-1.5 w-fit"
            >
              View Commit on GitHub <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {/* 7. error state: error message + retry */}
      {mode === 'error' && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] font-bold text-rose-400 leading-normal">
            <ShieldAlert size={15} />
            <span>Failed to apply fix</span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed font-mono">
            {errorMsg}
          </p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleAIFix}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded text-[10px] transition-all cursor-pointer"
            >
              Retry AI Fix
            </button>
            <button
              onClick={() => setMode('expanded')}
              className="px-3 py-1.5 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 text-slate-300 font-semibold rounded text-[10px] transition-all cursor-pointer"
            >
              Back to Steps
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
