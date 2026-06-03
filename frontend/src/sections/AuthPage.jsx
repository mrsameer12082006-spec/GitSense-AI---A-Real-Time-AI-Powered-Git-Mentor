import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mail, Lock, User, CheckCircle2 } from 'lucide-react';

export default function AuthPage({ initialMode }) {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormSubmitted(true);
    setTimeout(() => {
      setFormSubmitted(false);
      // Reset form and go to home page
      window.location.hash = '#home';
    }, 2000);
  };

  // Animation variants for the sliding overlay panel
  const overlayVariants = {
    login: {
      x: '100%',
      borderTopLeftRadius: '90px',
      borderBottomLeftRadius: '90px',
      borderTopRightRadius: '16px',
      borderBottomRightRadius: '16px',
    },
    signup: {
      x: '0%',
      borderTopLeftRadius: '16px',
      borderBottomLeftRadius: '16px',
      borderTopRightRadius: '90px',
      borderBottomRightRadius: '90px',
    },
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      
      {/* Top Header / Back Button */}
      <div className="absolute top-6 left-6 z-30">
        <button
          onClick={() => (window.location.hash = '#home')}
          className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </button>
      </div>

      {/* Main Container Card */}
      <div className="relative w-full max-w-[780px] min-h-[500px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] overflow-hidden flex flex-row">
        
        {/* Success Modal overlay */}
        <AnimatePresence>
          {formSubmitted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0B1020]/95 z-50 flex flex-col items-center justify-center text-center p-6"
            >
              <motion.div
                initial={{ scale: 0.6, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="w-16 h-16 rounded-full bg-[#00E38C]/15 border border-[#00E38C]/30 text-[#00E38C] flex items-center justify-center mb-4"
              >
                <CheckCircle2 size={32} />
              </motion.div>
              <h4 className="text-xl font-heading font-bold text-white mb-2">
                {isSignUp ? 'Account Created!' : 'Successfully Logged In!'}
              </h4>
              <p className="text-sm text-slate-400">
                Welcome to GitSense AI. Redirecting you to the workspace...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── LEFT HALF: Login Form ── */}
        <motion.div
          animate={{
            opacity: isSignUp ? 0 : 1,
            pointerEvents: isSignUp ? 'none' : 'auto',
            x: isSignUp ? -30 : 0,
          }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="absolute left-0 top-0 w-1/2 h-full flex flex-col justify-center px-12 z-10"
        >
          <h3 className="text-2xl font-bold font-heading text-center text-[#7C5CFF] mb-6">
            Log In
          </h3>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <Mail size={16} />
              </span>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Email"
                className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] transition-all"
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <Lock size={16} />
              </span>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] transition-all"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 bg-gradient-to-r from-[#7C5CFF] to-[#9A7DFF] text-white font-bold font-heading rounded-xl shadow-lg shadow-[#7C5CFF]/20 hover:shadow-xl hover:shadow-[#7C5CFF]/35 hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs tracking-wider uppercase cursor-pointer"
            >
              Log In
            </button>
          </form>
        </motion.div>

        {/* ── RIGHT HALF: Signup Form ── */}
        <motion.div
          animate={{
            opacity: isSignUp ? 1 : 0,
            pointerEvents: isSignUp ? 'auto' : 'none',
            x: isSignUp ? 0 : 30,
          }}
          transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
          className="absolute right-0 top-0 w-1/2 h-full flex flex-col justify-center px-12 z-10"
        >
          <h3 className="text-2xl font-bold font-heading text-center text-[#7C5CFF] mb-6">
            Create Account
          </h3>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <User size={16} />
              </span>
              <input
                type="text"
                name="name"
                required={isSignUp}
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Name"
                className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] transition-all"
              />
            </div>

            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <Mail size={16} />
              </span>
              <input
                type="email"
                name="email"
                required={isSignUp}
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Email"
                className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] transition-all"
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <Lock size={16} />
              </span>
              <input
                type="password"
                name="password"
                required={isSignUp}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] transition-all"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 bg-gradient-to-r from-[#7C5CFF] to-[#9A7DFF] text-white font-bold font-heading rounded-xl shadow-lg shadow-[#7C5CFF]/20 hover:shadow-xl hover:shadow-[#7C5CFF]/35 hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs tracking-wider uppercase cursor-pointer"
            >
              Sign Up
            </button>
          </form>
        </motion.div>

        {/* ── SLIDING OVERLAY PANEL ── */}
        <motion.div
          animate={isSignUp ? 'signup' : 'login'}
          variants={overlayVariants}
          transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
          className="absolute left-0 top-0 w-1/2 h-full bg-gradient-to-br from-[#7C5CFF] via-[#a855f7] to-[#EC4899] z-20 flex flex-col justify-center items-center overflow-hidden shadow-xl"
        >
          {/* Wave/Glow inner elements for aesthetic depth */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[200px] h-[200px] rounded-full bg-white/5 blur-2xl pointer-events-none" />

          <AnimatePresence mode="wait">
            {isSignUp ? (
              <motion.div
                key="signup-panel"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center px-10 text-center text-white"
              >
                <h3 className="text-2xl font-bold font-heading text-white mb-3">
                  Welcome Back!
                </h3>
                <p className="text-xs text-white/80 max-w-[220px] mb-8 leading-relaxed">
                  Already have an account? Keep your Git mentorship in sync.
                </p>
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className="px-8 py-2.5 bg-transparent border border-white/40 text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white/10 hover:border-white transition-all cursor-pointer"
                >
                  Log In
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="login-panel"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center px-10 text-center text-white"
              >
                <h3 className="text-2xl font-bold font-heading text-white mb-3">
                  Hello, Friend!
                </h3>
                <p className="text-xs text-white/80 max-w-[220px] mb-8 leading-relaxed">
                  Now here? Create your account and explore repository workflows visually.
                </p>
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="px-8 py-2.5 bg-transparent border border-white/40 text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-white/10 hover:border-white transition-all cursor-pointer"
                >
                  Sign Up
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}
