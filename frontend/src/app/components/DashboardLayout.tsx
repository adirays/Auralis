import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, Activity } from 'lucide-react';
import { Outlet } from 'react-router';

export function DashboardLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row w-screen h-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
      
      {/* Mobile Top Nav */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[2px] bg-primary flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <h1 className="orbitron-brand text-lg font-bold tracking-wider m-0">
            AURALIS
          </h1>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="p-1.5 text-foreground hover:bg-sidebar-accent/50 rounded-[2px] transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out h-full shrink-0
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto min-w-0 w-full">
        <Outlet />
      </main>
    </div>
  );
}
