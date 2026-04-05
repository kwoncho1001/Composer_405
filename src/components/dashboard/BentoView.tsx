import React from 'react';
import { Note, ProactiveNudge } from '../../types';
import { Target, Receipt, Presentation, Swords, Sparkles, MessageSquarePlus, ChevronRight, Loader2, CheckCircle2, AlertCircle, CircleDashed, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BentoViewProps {
  notes: Note[];
  nudges: ProactiveNudge[];
  isFetchingNudges: boolean;
  onAcceptNudge: (nudge: ProactiveNudge) => void;
  applyingNudgeId: string | null;
  onOpenAction: (action: string) => void;
}

export const BentoView: React.FC<BentoViewProps> = ({ notes, nudges, isFetchingNudges, onAcceptNudge, applyingNudgeId, onOpenAction }) => {
  const totalNotes = notes.length;
  const completedNotes = notes.filter(n => n.status === 'Done').length;
  const progress = totalNotes === 0 ? 0 : Math.round((completedNotes / totalNotes) * 100);

  const p1Notes = notes.filter(n => n.priority === 'P1');
  const conflictNotes = notes.filter(n => n.status === 'Conflict');

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
        {/* Progress & Health */}
        <div className="col-span-1 md:col-span-2 lg:col-span-2 bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Project Health</h3>
            <div className="flex items-end gap-4 mb-6">
              <span className="text-6xl font-black tracking-tighter">{progress}%</span>
              <span className="text-muted-foreground mb-2 font-medium">Completed</span>
            </div>
            
            <div className="w-full bg-muted rounded-full h-3 mb-6 overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-background rounded-2xl p-4 border border-border flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black">{totalNotes}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Total Modules</span>
            </div>
            <div className="bg-rose-500/10 text-rose-500 rounded-2xl p-4 border border-rose-500/20 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black">{conflictNotes.length}</span>
              <span className="text-[10px] uppercase tracking-widest mt-1">Conflicts</span>
            </div>
            <div className="bg-amber-500/10 text-amber-500 rounded-2xl p-4 border border-amber-500/20 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black">{p1Notes.length}</span>
              <span className="text-[10px] uppercase tracking-widest mt-1">P1 Priority</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-span-1 lg:col-span-2 grid grid-cols-2 gap-4">
          <button onClick={() => onOpenAction('competitor')} className="bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 border border-rose-500/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all group">
            <Swords size={32} className="group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">경쟁사 역설계</span>
          </button>
          <button onClick={() => onOpenAction('pitch')} className="bg-purple-500/10 hover:bg-purple-500 hover:text-white text-purple-500 border border-purple-500/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all group">
            <Presentation size={32} className="group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">Pitch Deck</span>
          </button>
          <button onClick={() => onOpenAction('cost')} className="bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-500 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all group">
            <Receipt size={32} className="group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">Burn Rate 예측</span>
          </button>
          <button onClick={() => onOpenAction('mvp')} className="bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary border border-primary/20 rounded-3xl p-6 flex flex-col items-center justify-center gap-3 transition-all group">
            <Target size={32} className="group-hover:scale-110 transition-transform" />
            <span className="font-bold text-sm">MVP 스코핑</span>
          </button>
        </div>

        {/* AI Co-founder Nudges */}
        <div className="col-span-1 md:col-span-3 lg:col-span-4 bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 rounded-3xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Sparkles size={16} /> AI Co-founder Insights
            </h3>
            
            {isFetchingNudges ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground animate-pulse text-center">
                  현재 시스템을 분석하여<br/>새로운 비즈니스 아이디어를 발상 중입니다...
                </p>
              </div>
            ) : nudges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nudges.map(nudge => (
                  <div key={nudge.id} className="bg-background/80 backdrop-blur-sm border border-border rounded-2xl p-5 shadow-sm hover:border-primary/30 transition-colors flex flex-col">
                    <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
                      <MessageSquarePlus size={14} className="text-primary" />
                      {nudge.context}
                    </p>
                    <p className="text-sm font-bold text-foreground leading-relaxed mb-4 flex-1">
                      {nudge.question}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {nudge.keywords.map((kw, i) => (
                        <span key={i} className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/10">
                          #{kw}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => onAcceptNudge(nudge)}
                      disabled={applyingNudgeId === nudge.id}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-auto"
                    >
                      {applyingNudgeId === nudge.id ? (
                        <><Loader2 size={14} className="animate-spin" /> 적용 중...</>
                      ) : (
                        <>아이디어 구체화 및 적용 <ChevronRight size={14} /></>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm bg-background/50 rounded-2xl border border-dashed border-border">
                {notes.length === 0 ? "프로젝트에 노트를 추가하면 AI 코파운더가 인사이트를 제공합니다." : "현재 제안할 새로운 아이디어가 없습니다."}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
