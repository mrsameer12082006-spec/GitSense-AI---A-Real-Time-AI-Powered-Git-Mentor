import React, { useState, useEffect } from 'react';
import CursorSpotlight from './components/CursorSpotlight';
import ParticleCanvas from './components/ParticleCanvas';
import Navbar from './sections/Navbar';
import Hero from './sections/Hero';
import VisualizerSection from './sections/VisualizerSection';
import AIShowcase from './sections/AIShowcase';
import HealthDashboard from './sections/HealthDashboard';
import Features from './sections/Features';
import HowItWorks from './sections/HowItWorks';
import Developers from './sections/Developers';
import AuthPage from './sections/AuthPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash;
    if (hash === '#login' || hash === '#signup') return 'auth';
    return 'home';
  });

  const [authMode, setAuthMode] = useState(() => {
    return window.location.hash === '#signup' ? 'signup' : 'login';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#login') {
        setCurrentPage('auth');
        setAuthMode('login');
      } else if (hash === '#signup') {
        setCurrentPage('auth');
        setAuthMode('signup');
      } else if (hash === '#home' || !hash) {
        setCurrentPage('home');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#F8FAFC] relative overflow-x-hidden">

      {/* Layer 0 — fixed canvas background */}
      <ParticleCanvas />

      {/* Layer 1 — mouse-based spotlight tracker */}
      <CursorSpotlight />

      {/* Layer 2 — page layout */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {currentPage === 'home' ? (
          <>
            <Navbar />
            <main className="flex-1">
              <Hero />
              <VisualizerSection />
              <AIShowcase />
              <HealthDashboard />
              <Features />
              <HowItWorks />
              <Developers />
            </main>
          </>
        ) : (
          <AuthPage initialMode={authMode} />
        )}
      </div>
    </div>
  );
}
