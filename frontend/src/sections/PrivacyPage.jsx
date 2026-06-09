import React from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { ShieldAlert, Key, EyeOff, Lock } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">Privacy & Data Policy</h2>
          <p className="text-sm text-slate-400">Read our strict security commitments regarding your repository and user data.</p>
        </div>

        {/* Card */}
        <div className="gitsense-card p-8 flex flex-col gap-6 border-white/[0.08] bg-[#0b1220]/70 text-left">
          
          {/* Core statement */}
          <div className="flex gap-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 items-start">
            <Lock className="text-[#00E38C] mt-0.5 flex-shrink-0" size={18} />
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-bold text-slate-100">Zero Data Collection Policy</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                At GitSense, privacy is not a feature — it is our architectural foundation. **We do not collect, store, transmit, or monetize any of your repository files, commit logs, code structures, credentials, or personal data.**
              </p>
            </div>
          </div>

          {/* Privacy Pillars */}
          <div className="flex flex-col gap-5 mt-2">
            
            <div className="flex gap-3 items-start">
              <EyeOff size={16} className="text-[#00D4FF] mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-200">Local Parsing and Transience</span>
                <span className="text-[11px] text-slate-400 leading-relaxed">
                  All commit trees, branch divergence calculations, and staging indexes are processed locally on your computer. When you prompt GitSense, queries are executed dynamically without leaving databases behind.
                </span>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <Key size={16} className="text-[#7C5CFF] mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-200">Secure API Authentication</span>
                <span className="text-[11px] text-slate-400 leading-relaxed">
                  OAuth authorization for connected GitHub repositories is handled strictly within secure web sessions. Token assets are saved only inside your local browser memory and never uploaded to any remote host.
                </span>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <ShieldAlert size={16} className="text-rose-400 mt-0.5 flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-slate-200">Local Sandbox Boundaries</span>
                <span className="text-[11px] text-slate-400 leading-relaxed">
                  GitSense has zero background data scrapers or tracking pixels. The platform contains no user behavior telemetry, allowing you to code and manage sensitive company codebases with complete confidentiality.
                </span>
              </div>
            </div>

          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-white/[0.05] text-[10px] text-slate-500 leading-relaxed">
            By running this local application instance, you are secured by our Sandbox Privacy Agreement. If you have questions about how the local index parser operates, please contact the developer team.
          </div>

        </div>
      </div>
    </SubPageLayout>
  );
}
