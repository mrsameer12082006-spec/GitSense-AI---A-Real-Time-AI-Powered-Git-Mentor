import React from 'react';
import { Mail } from 'lucide-react';

const devs = [
  {
    name: 'Sameer Mishra',
    role: 'Product Lead & UI/UX',
    email: 'mrsameer12082006@gmail.com',
    linkedin: 'https://www.linkedin.com/in/sameer-mishra2006',
    emoji: '😎',
  },
  {
    name: 'Kartik Sharma',
    role: 'Frontend & Graph Visualization',
    email: 'kartik.s1280@gmail.com',
    linkedin: 'https://www.linkedin.com/in/kartik1280',
    emoji: '🧑‍💻',
  },
  {
    name: 'Manik Chauhan',
    role: 'AI Logic & Backend',
    email: '2manik2288@gmail.com',
    linkedin: 'https://www.linkedin.com/in/manik-chauhan-5221573b7',
    emoji: '🤖',
  },
  {
    name: 'Ayesh Srivastava',
    role: 'Testing & Documentation',
    email: 'ayeshsrivastava@gmail.com',
    linkedin: 'https://www.linkedin.com/in/ayesh-srivastava-780672390',
    emoji: '📚',
  },
];

export default function Developers() {
  return (
    <section id="developers" className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-4">
          <div className="h-0.5 w-24 bg-gradient-to-r from-cyan-400/20 to-violet-400/10 rounded" />
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-emerald-300"><path d="M12 2L15 8H9L12 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Meet The Developers
          </div>
          <div className="h-0.5 w-24 bg-gradient-to-l from-cyan-400/20 to-violet-400/10 rounded" />
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">The minds behind GitSense AI</h2>
        <p className="mt-2 text-sm text-slate-400">We craft the UX, visualization, AI, and infrastructure powering GitSense AI.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {devs.map((d) => (
          <article
            key={d.name}
            className={`relative overflow-hidden rounded-2xl border border-white/6 p-6 transition-transform duration-300 hover:-translate-y-2 ${d.primary ? 'scale-[1.03] shadow-[0_18px_60px_rgba(124,92,255,0.08)]' : ''}`}
          >
            <div className={`glass-card p-5 ${d.primary ? 'border-white/12' : ''}`}>
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-[#0b1220] to-[#071018] flex items-center justify-center text-4xl" aria-hidden>
                    <span className="text-4xl">{d.emoji}</span>
                  </div>
                  <div className="absolute -inset-px rounded-full pointer-events-none" style={{ boxShadow: d.primary ? '0 0 32px rgba(61,255,166,0.16), 0 0 48px rgba(124,92,255,0.08)' : '0 0 18px rgba(61,255,166,0.08)' }} />
                </div>

                <div className="text-lg font-semibold text-white">{d.name}</div>
                <div className="mt-2">
                  <span className="inline-block rounded-full bg-white/4 px-3 py-1 text-xs font-semibold text-slate-200">{d.role}</span>
                </div>

                <div className="mt-4 w-full flex flex-col gap-3">
                  <a href={`mailto:${d.email}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-[#071018]/60 px-3 py-2 text-sm text-slate-200 hover:shadow-[0_8px_28px_rgba(34,197,94,0.06)]">
                    <div className="flex items-center gap-3">
                      <Mail size={16} className="text-cyan-300" />
                      <span className="truncate">{d.email}</span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-300"><path d="M17 7L7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>

                  <div className="flex items-center justify-center gap-3">
                    <a href={d.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/3 px-3 py-2 text-xs text-white/90 hover:bg-white/5 transition">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-cyan-300"><path d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4v-12h4v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span className="text-xs">LinkedIn</span>
                    </a>
                    {d.primary && (
                      <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-xs font-semibold text-black">
                        Primary Contact
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Bottom company footer removed as requested */}
    </section>
  );
}
