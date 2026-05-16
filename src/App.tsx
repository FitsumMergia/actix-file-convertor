import React, { useState, useCallback, useEffect } from 'react';
import { 
  FileUp, 
  Settings, 
  History, 
  LayoutDashboard, 
  Terminal, 
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCcw,
  Trash2,
  Download,
  Database,
  Search,
  Activity,
  HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatBytes } from './lib/utils';
import { LogFile, FileStatus, ConversionProfile, SystemStats } from './types';
import { conversionEngine } from './services/conversionService';
import { saveAs } from 'file-saver';

// Default Profiles
const DEFAULT_PROFILES: ConversionProfile[] = [
  {
    id: 'actix-5',
    name: 'Actix Analyzer 5.x',
    description: 'Legacy 32/64-bit (v2.01 format)',
    targetActixVersion: '5.5',
    settings: { preserveNR: false, preserveScanner: false, exportCSV: true }
  },
  {
    id: 'actix-2021',
    name: 'Actix Analyzer 2021',
    description: 'Legacy LTE Support (No NR)',
    targetActixVersion: '2021.3',
    settings: { preserveNR: false, preserveScanner: true, exportCSV: true }
  },
  {
    id: 'actix-2023',
    name: 'Actix Analyzer 2023',
    description: 'Latest Stable (Partial NR)',
    targetActixVersion: '2023.1',
    settings: { preserveNR: true, preserveScanner: true, exportCSV: false }
  },
  {
    id: 'universal-csv',
    name: 'Universal CSV Export',
    description: 'Raw KPI Extraction',
    targetActixVersion: 'N/A',
    settings: { preserveNR: true, preserveScanner: true, exportCSV: true }
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'settings'>('dashboard');
  const [files, setFiles] = useState<LogFile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ConversionProfile>(DEFAULT_PROFILES[0]);
  const [stats, setStats] = useState<SystemStats>({
    filesProcessed: 0,
    totalDataConverted: 0,
    activeJobs: 0,
    systemHealth: 'optimal'
  });
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);

  const addLog = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(prev => [...prev.slice(-49), { msg, type }]);
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    const newFiles: LogFile[] = Array.from(uploadedFiles).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.name.split('.').pop() || 'unknown',
      status: 'idle',
      progress: 0,
      targetProfile: activeProfile.id,
      timestamp: Date.now(),
      rawFile: file // Store the raw file reference for processing
    } as unknown as LogFile));

    setFiles(prev => [...newFiles, ...prev]);
    addLog(`Imported ${newFiles.length} file(s) for processing`, 'info');
  };

  const processFile = async (fileId: string) => {
    const fileIndex = files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) return;

    const file = files[fileIndex] as LogFile & { rawFile: File };
    
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing', progress: 0 } : f));
    addLog(`Starting conversion: ${file.name}`, 'info');

    try {
      const result = await conversionEngine.convertFile(
        file.rawFile,
        activeProfile,
        (progress) => {
          setFiles(prev => prev.map(f => f.id === fileId ? { ...f, progress } : f));
        }
      );

      setFiles(prev => prev.map(f => f.id === fileId ? { 
        ...f, 
        status: 'completed', 
        result 
      } : f));
      
      setStats(prev => ({
        ...prev,
        filesProcessed: prev.filesProcessed + 1,
        totalDataConverted: prev.totalDataConverted + file.size
      }));
      
      addLog(`Completed: ${file.name} (${result?.eventCount} events)`, 'success');
      addLog(`Export prepared as ${result?.outputPath} (Strict Legacy Mode)`, 'info');
    } catch (error) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'failed', error: 'Conversion failed' } : f));
      addLog(`Error processing ${file.name}: ${error}`, 'error');
    }
  };

  const processAll = async () => {
    const idleFiles = files.filter(f => f.status === 'idle' || f.status === 'failed');
    for (const file of idleFiles) {
      await processFile(file.id);
    }
  };

  const clearQueue = () => {
    setFiles([]);
    addLog('Queue cleared', 'info');
  };

  return (
    <div className="flex h-screen bg-[#0A0B0E] text-[#E0E0E0] font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className="w-16 md:w-60 border-r border-[#2A2A2E] flex flex-col bg-[#0F1115] overflow-hidden transition-all duration-300">
        <div className="p-4 border-b border-[#2A2A2E] flex items-center gap-3 bg-[#121418]">
          <div className="w-8 h-8 bg-blue-600 flex items-center justify-center rounded text-white shadow-lg shadow-blue-600/20">
            <Activity size={18} strokeWidth={2.5} />
          </div>
          <div className="hidden md:block">
            <span className="block font-bold tracking-tight text-sm uppercase text-white leading-none">Nemo Legacy</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 block">Converter UI</span>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'history', icon: History, label: 'History' },
            { id: 'settings', icon: Settings, label: 'Profiles' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-sm font-medium group",
                activeTab === item.id 
                  ? "bg-[#1A1D24] text-white border border-[#2A2A2E]" 
                  : "text-zinc-500 hover:bg-[#1A1D24] hover:text-white border border-transparent"
              )}
            >
              <item.icon size={18} className={cn(activeTab === item.id ? "text-blue-500" : "group-hover:text-blue-400")} />
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#2A2A2E] bg-[#0A0B0E]">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-zinc-600 mb-2 tracking-widest">
            <Database size={12} />
            STATUS: ONLINE
          </div>
          <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 w-[85%]" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0A0B0E]">
        {/* Stats Header */}
        <header className="px-6 py-4 flex items-center justify-between border-b border-[#2A2A2E] bg-[#121418] sticky top-0 z-10 shadow-xl shadow-black/20">
          <div className="flex gap-10">
            <div className="flex flex-col">
              <span className="stat-label">Processed Logs</span>
              <span className="text-xl font-mono leading-none text-white tracking-tighter">{stats.filesProcessed}</span>
            </div>
            <div className="flex flex-col">
              <span className="stat-label">Payload Volume</span>
              <span className="text-xl font-mono leading-none text-white tracking-tighter">{formatBytes(stats.totalDataConverted)}</span>
            </div>
            <div className="flex flex-col">
              <span className="stat-label">System State</span>
              <span className={cn(
                "text-[10px] font-bold leading-none px-1.5 py-1 rounded mt-1 uppercase tracking-wider border",
                stats.systemHealth === 'optimal' 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              )}>Optimal</span>
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <div className="hidden xl:flex flex-col items-end mr-4">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Active Profile</span>
              <span className="text-xs text-blue-400 font-medium">{activeProfile.name}</span>
            </div>
            <button 
              onClick={processAll}
              disabled={!files.some(f => f.status === 'idle' || f.status === 'failed')}
              className="px-6 py-2.5 bg-blue-600 text-white rounded text-xs font-bold flex items-center gap-2 hover:bg-blue-500 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-lg shadow-blue-600/20"
            >
              <Play size={14} fill="currentColor" />
              RUN CONVERSION BATCH
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 space-y-6 grid-lines">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Area */}
            <div className="lg:col-span-2 space-y-6">
              <div 
                className="relative group h-44 border border-[#2A2A2E] rounded-xl hover:border-blue-600/50 transition-all flex flex-col items-center justify-center cursor-pointer bg-[#121418] shadow-2xl"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input 
                  type="file" 
                  id="file-input" 
                  className="hidden" 
                  multiple 
                  onChange={handleFileUpload}
                  accept=".nmf,.nmfs,.nbl,.dt1,.dt2"
                />
                <div className="w-12 h-12 bg-[#1A1D24] rounded-lg border border-[#2A2A2E] flex items-center justify-center group-hover:border-blue-600/50 group-hover:scale-105 transition-all mb-4 shadow-inner">
                  <FileUp className="text-zinc-500 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Initialize New Import</h3>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest">Awaiting NMF, NMFS, NBL, or DT1/2 payloads</p>
              </div>

              {/* Queue */}
              <div className="bg-[#121418] border border-[#2A2A2E] rounded-xl overflow-hidden shadow-2xl">
                <div className="px-5 py-4 border-b border-[#2A2A2E] flex items-center justify-between bg-[#1A1D24]">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shadow-sm shadow-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Conversion Core Queue</span>
                  </div>
                  <button 
                    onClick={clearQueue}
                    className="text-[10px] uppercase font-bold text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={12} /> Purge Queue
                  </button>
                </div>

                <div className="divide-y divide-[#2A2A2E]">
                  {files.length === 0 ? (
                    <div className="p-16 text-center text-zinc-600">
                      <Terminal size={40} className="mx-auto opacity-10 mb-5" />
                      <p className="text-[11px] font-mono uppercase tracking-[0.3em]">System Standby. Pipeline Empty.</p>
                    </div>
                  ) : (
                    files.map((file) => (
                      <div key={file.id} className="p-5 flex items-center gap-5 hover:bg-[#1A1D24] transition-all group">
                        <div className="w-12 h-12 bg-[#0A0B0E] rounded border border-[#2A2A2E] flex items-center justify-center text-blue-500 font-mono text-[10px] font-black group-hover:border-blue-500/30 transition-all shadow-inner">
                          {file.type.toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-zinc-300 truncate">{file.name}</span>
                            <span className="text-[10px] text-zinc-600 font-mono">{formatBytes(file.size)}</span>
                          </div>
                          
                          <div className="mt-3 flex items-center gap-4">
                            <div className="flex-1 h-1.5 bg-[#0A0B0E] rounded-full overflow-hidden border border-[#2A2A2E]">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${file.progress}%` }}
                                className={cn(
                                  "h-full transition-all duration-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]",
                                  file.status === 'completed' ? "bg-emerald-500 shadow-emerald-500/20" : 
                                  file.status === 'failed' ? "bg-red-500 shadow-red-500/20" : "bg-blue-600"
                                )}
                              />
                            </div>
                            <span className="text-[10px] font-mono w-10 text-right text-zinc-500">{Math.round(file.progress)}%</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {file.status === 'completed' && file.result && (
                            <div className="hidden lg:flex flex-col items-end">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Preservation {file.result.kpiPreservationScore.toFixed(1)}%</span>
                              <span className="text-[9px] text-zinc-600 uppercase font-mono tracking-wider">SEC: {file.result.eventCount} EVT</span>
                            </div>
                          )}

                          <div className="w-24 flex justify-end">
                            {file.status === 'idle' && (
                              <button 
                                onClick={() => processFile(file.id)}
                                className="p-2.5 text-zinc-500 hover:text-white hover:bg-[#2A2A2E] border border-transparent hover:border-[#3A3A3E] rounded-md transition-all active:scale-90"
                              >
                                <Play size={16} className="fill-current" />
                              </button>
                            )}
                            {file.status === 'processing' && (
                              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            )}
                            {file.status === 'completed' && (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => {
                                    const outBlob = file.result?.outputBlob;
                                    if (!outBlob) return;
                                    const outName = file.result?.outputPath || 'converted.nmf';
                                    saveAs(outBlob, outName);
                                    addLog(`Exported: ${outName}`, 'success');
                                  }}
                                  className="p-2.5 text-blue-500 hover:bg-blue-500/10 rounded-md transition-all active:scale-90"
                                >
                                  <Download size={16} />
                                </button>
                                <button 
                                  onClick={() => processFile(file.id)}
                                  className="p-2.5 text-zinc-600 hover:text-zinc-300 rounded-md transition-all active:scale-90"
                                >
                                  <RotateCcw size={16} />
                                </button>
                              </div>
                            )}
                            {file.status === 'failed' && (
                              <div className="flex items-center gap-2 text-red-500">
                                <AlertCircle size={18} />
                                <button onClick={() => processFile(file.id)} className="p-2.5 hover:bg-red-500/10 rounded-md transition-all active:scale-90">
                                  <RotateCcw size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Config Side */}
            <div className="space-y-6">
              <div className="bg-[#121418] border border-[#2A2A2E] rounded-xl p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-4 bg-blue-600 rounded-full" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">Environment Profile</span>
                </div>
                
                <div className="space-y-5">
                  <p className="text-[10px] text-zinc-500 leading-relaxed uppercase tracking-widest leading-normal">
                    Select target Actix version. The core engine will resolve event schema collisions.
                  </p>
                  
                  <div className="space-y-2.5">
                    {DEFAULT_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => setActiveProfile(profile)}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden",
                          activeProfile.id === profile.id 
                            ? "border-blue-600/50 bg-[#1A1D24] ring-1 ring-blue-600/50" 
                            : "border-[#2A2A2E] hover:border-zinc-700 bg-transparent hover:bg-[#1A1D24]/50"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1.5 relative z-10">
                          <span className={cn(
                            "text-xs font-bold transition-colors",
                            activeProfile.id === profile.id ? "text-white" : "text-zinc-400"
                          )}>{profile.name}</span>
                          {activeProfile.id === profile.id && <CheckCircle2 size={16} className="text-blue-500" />}
                        </div>
                        <p className="text-[9px] text-zinc-500 uppercase font-mono tracking-widest relative z-10">{profile.description}</p>
                        {activeProfile.id === profile.id && (
                          <div className="absolute inset-0 bg-blue-600/5 backdrop-blur-sm" />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-[#2A2A2E] flex flex-col gap-4">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Preserve 5G NR Stack</span>
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={activeProfile.settings.preserveNR} readOnly />
                        <div className="w-9 h-5 bg-[#2A2A2E] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                    </label>
                    
                    <label className="flex items-center justify-between cursor-pointer group">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Parallel CSV Export</span>
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={activeProfile.settings.exportCSV} readOnly />
                        <div className="w-9 h-5 bg-[#2A2A2E] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Quick Docs */}
              <div className="bg-[#121418] border border-blue-600/20 rounded-xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-600/10 transition-all duration-700" />
                <div className="flex items-center gap-3 mb-4">
                  <Terminal size={18} className="text-blue-500" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Core Diagnostics</span>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                    <span>MAPPING ENGINE</span>
                    <span className="text-emerald-500 italic">v4.2.1-SECURE</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                    <span>VIRTUAL_LTE</span>
                    <span className="text-blue-500">ENABLED</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-mono uppercase tracking-wider bg-black/40 p-3 rounded border border-[#2A2A2E]">
                  &gt; STACK DETECTION: NMF_SECURE<br/>
                  &gt; SYNC STATUS: LOCKED<br/>
                  &gt; NR_NR_MEAS_MAPPING: ACTIVE
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Diagnostic Logs */}
        <footer className="h-40 border-t border-[#2A2A2E] bg-[#0A0B0E] overflow-hidden flex flex-col shadow-2xl shadow-black">
          <div className="px-6 py-2.5 border-b border-[#2A2A2E] flex items-center justify-between bg-[#121418]">
            <div className="flex items-center gap-3">
              <Terminal size={14} className="text-zinc-500" />
              <span className="text-[10px] font-bold uppercase text-white tracking-[0.3em]">System Diagnostics Real-time</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-[10px] font-mono text-zinc-500"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> ENGINE: RDY</span>
              <span className="flex items-center gap-2 text-[10px] font-mono text-zinc-500"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> IO_PIPELINE: CLR</span>
            </div>
          </div>
          <div id="log-container" className="flex-1 overflow-auto p-4 font-mono text-[11px] bg-black/20">
            {logs.length === 0 ? (
              <span className="text-zinc-700 tracking-widest font-bold">READY FOR DATA INJECTION...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={cn(
                  "flex gap-3 mb-1.5 border-l-2 pl-3 transition-colors",
                  log.type === 'error' ? "text-red-500 border-red-500/50 bg-red-500/5" : 
                  log.type === 'success' ? "text-emerald-500 border-emerald-500/50 bg-emerald-500/5" : "text-zinc-500 border-transparent"
                )}>
                  <span className="text-[9px] opacity-30 mt-0.5">[{new Date().toLocaleTimeString()}]</span>
                  <span className="font-bold opacity-60">{log.type === 'error' ? 'ERR' : log.type === 'success' ? 'LOG' : 'INF'}</span>
                  <span className="tracking-tight">{log.msg}</span>
                </div>
              ))
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
