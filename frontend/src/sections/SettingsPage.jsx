import React, { useState } from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { Settings, Sliders, Shield, Bell, Check, Save } from 'lucide-react';

export default function SettingsPage() {
  const [model, setModel] = useState(() => localStorage.getItem('gitsense_settings_model') || 'gemini-flash');
  const [temp, setTemp] = useState(() => parseFloat(localStorage.getItem('gitsense_settings_temp') || '0.2'));
  const [notifications, setNotifications] = useState(() => localStorage.getItem('gitsense_settings_notifications') !== 'false');
  const [safeguards, setSafeguards] = useState(() => localStorage.getItem('gitsense_settings_safeguards') !== 'false');
  
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('gitsense_settings_model', model);
    localStorage.setItem('gitsense_settings_temp', temp.toString());
    localStorage.setItem('gitsense_settings_notifications', notifications.toString());
    localStorage.setItem('gitsense_settings_safeguards', safeguards.toString());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">Settings</h2>
          <p className="text-sm text-slate-400">Configure AI model selections, safeguards, and notification preferences.</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSave} className="gitsense-card p-8 flex flex-col gap-6 border-white/[0.08] bg-[#0b1220]/70 text-left">
          
          {/* Model Selection */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders size={15} className="text-[#00D4FF]" />
              Model Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
              {[
                { id: 'gemini-flash', name: 'Gemini 3.5 Flash', desc: 'Fast responses, optimal for quick Git troubleshooting.' },
                { id: 'gemini-pro', name: 'Gemini 3.5 Pro', desc: 'Deep analytical understanding, recommended for complex rebasing.' }
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setModel(opt.id)}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                    model === opt.id
                      ? 'bg-[#7C5CFF]/10 border-[#7C5CFF] text-white shadow-[0_4px_20px_rgba(124,92,255,0.1)]'
                      : 'bg-slate-950/40 border-white/[0.06] text-slate-400 hover:border-white/[0.14] hover:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-bold font-heading">{opt.name}</span>
                  <span className="text-[10px] leading-relaxed opacity-80">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI Temperature */}
          <div className="flex flex-col gap-2 pt-4 border-t border-white/[0.05]">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-slate-200">AI Creativity (Temperature)</label>
              <span className="font-mono text-xs text-[#00D4FF] bg-[#00D4FF]/10 px-2 py-0.5 rounded">{temp}</span>
            </div>
            <p className="text-[11px] text-slate-500">Lower values make responses more deterministic and factual. Higher values allow creative suggestions.</p>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.1"
              value={temp}
              onChange={(e) => setTemp(parseFloat(e.target.value))}
              className="w-full accent-[#7C5CFF] mt-2 cursor-pointer"
            />
          </div>

          {/* Safety Settings */}
          <div className="flex flex-col gap-3 pt-4 border-t border-white/[0.05]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Shield size={15} className="text-[#00E38C]" />
              Safe Mode Safeguards
            </h3>
            
            <label className="flex items-start gap-3 cursor-pointer select-none group mt-1">
              <input
                type="checkbox"
                checked={safeguards}
                onChange={(e) => setSafeguards(e.target.checked)}
                className="w-4 h-4 rounded border-white/[0.1] bg-slate-950 accent-[#7C5CFF] mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">Smart Command Guards</span>
                <span className="text-[10px] text-slate-500 leading-normal">Intercept push or merge operations when your branch is out of sync.</span>
              </div>
            </label>
          </div>

          {/* Notifications */}
          <div className="flex flex-col gap-3 pt-4 border-t border-white/[0.05]">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bell size={15} className="text-[#7C5CFF]" />
              Notifications
            </h3>
            
            <label className="flex items-start gap-3 cursor-pointer select-none group mt-1">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="w-4 h-4 rounded border-white/[0.1] bg-slate-950 accent-[#7C5CFF] mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">Alerts for Out-of-Sync Commits</span>
                <span className="text-[10px] text-slate-500 leading-normal">Receive high-priority system sound or bar updates on local divergence detection.</span>
              </div>
            </label>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            className="mt-3 btn btn-primary flex items-center justify-center gap-2 self-start py-2.5 px-6 !text-sm cursor-pointer"
          >
            {isSaved ? (
              <>
                <Check size={15} className="text-[#00E38C]" />
                <span>Settings Saved</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>Save Configuration</span>
              </>
            )}
          </button>

        </form>
      </div>
    </SubPageLayout>
  );
}
