import React from 'react';

export const FooterBar: React.FC = () => (
  <footer className="min-h-8 bg-white dark:bg-[#070A0F] border-t border-slate-200 dark:border-slate-800/80 px-4 md:px-6 flex items-center justify-between gap-3 text-[10px] md:text-[11px] font-mono text-slate-500 shrink-0 select-none z-20 transition-colors">
    <span>PhishGuard · machine-learning phishing detection</span>
    <span className="text-right">Local SQLite history · submitted URLs are not opened</span>
  </footer>
);
