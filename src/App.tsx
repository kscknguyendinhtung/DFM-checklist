/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  History, 
  Lightbulb, 
  Save, 
  LogOut, 
  FileText,
  Search,
  Loader2,
  ArrowLeft,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MASTER_CHECKLIST } from './constants';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';

// --- Types ---

interface User {
  uid: string;
  displayName: string;
  email: string;
}

interface Project {
  id: string;
  name: string;
  createdAt: any;
  ownerId: string;
  status: 'in-progress' | 'completed';
}

interface Stamp {
  id: string;
  type: 'OK' | 'NG' | 'NAME' | 'DATE';
  text: string;
  x: number;
  y: number;
  page: number;
}

interface ChecklistItem {
  id: string;
  item: string;
  subItem: string;
  checkPoint: string;
  standard: string;
  remark?: string;
}

interface CheckResult {
  id?: string;
  projectId: string;
  checklistItemId: string;
  status: 'OK' | 'NG' | 'N/A';
  remark: string;
  updatedAt: any;
}

interface LessonLearned {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: any;
  authorId: string;
}

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'text-gray-500 hover:bg-gray-100'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'neutral' }: any) => {
  const variants: any = {
    neutral: 'bg-gray-100 text-gray-600',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700'
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

// --- Main App ---

import * as pdfjsLib from 'pdfjs-dist';

// Set worker for pdfjs using Vite's built-in worker handling
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [lessons, setLessons] = useState<LessonLearned[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    issue: string;
    solution: string;
    reference: string;
    suggestion: 'OK' | 'NG' | 'N/A';
    summary: string;
    relevantItemIds: string[];
  } | null>(null);
  const [suggestedItems, setSuggestedItems] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [view, setView] = useState<'dashboard' | 'project' | 'lessons'>('dashboard');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showAllChecklist, setShowAllChecklist] = useState(false);
  const [panelWidth, setPanelWidth] = useState(70); // 70% for PDF, 30% for Checklist
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [isDraggingStamp, setIsDraggingStamp] = useState<string | null>(null);

  const [showChecklist, setShowChecklist] = useState(true);
  const [showAiResults, setShowAiResults] = useState(false);

  // PDF State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [showLessonPrompt, setShowLessonPrompt] = useState(false);
  const [lessonSuggestion, setLessonSuggestion] = useState<{
    title: string;
    content: string;
    category: string;
    tag: string;
    standard: string;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [markers, setMarkers] = useState<Array<{ x: number, y: number, type: 'OK' | 'NG', page: number, remark?: string }>>([]);

  const dfmInputRef = useRef<HTMLInputElement>(null);
  const checksheetInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Mock Auth & Data Persistence ---
  useEffect(() => {
    const savedUser = localStorage.getItem('dfm_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      seedChecklistOnce();
      fetchProjects();
      fetchLessons();
    }
  }, [user]);

  const login = async () => {
    const mockUser: User = {
      uid: 'user-123',
      displayName: 'DFM Expert',
      email: 'expert@example.com'
    };
    localStorage.setItem('dfm_user', JSON.stringify(mockUser));
    setUser(mockUser);
  };

  const logout = () => {
    localStorage.removeItem('dfm_user');
    setUser(null);
    setView('dashboard');
  };

  // --- Data Fetching (localStorage) ---
  const seedChecklistOnce = () => {
    const saved = localStorage.getItem('dfm_checklist');
    if (!saved) {
      const initial = MASTER_CHECKLIST.map((item, idx) => ({ ...item, id: `item-${idx}` }));
      localStorage.setItem('dfm_checklist', JSON.stringify(initial));
      setChecklist(initial);
    } else {
      setChecklist(JSON.parse(saved));
    }
  };

  const fetchProjects = () => {
    const saved = localStorage.getItem('dfm_projects');
    if (saved) {
      const pList = JSON.parse(saved);
      setProjects(pList.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }
  };

  const fetchLessons = () => {
    const saved = localStorage.getItem('dfm_lessons');
    if (saved) {
      const lList = JSON.parse(saved);
      setLessons(lList.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }
  };

  const fetchResults = (projectId: string) => {
    const saved = localStorage.getItem(`dfm_results_${projectId}`);
    if (saved) {
      setResults(JSON.parse(saved));
    } else {
      setResults({});
    }
  };

  const deleteProject = (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    const updated = projects.filter(p => p.id !== projectId);
    localStorage.setItem('dfm_projects', JSON.stringify(updated));
    setProjects(updated);
    localStorage.removeItem(`dfm_results_${projectId}`);
    if (currentProject?.id === projectId) setView('dashboard');
  };

  const updateProject = (projectId: string, name: string) => {
    const updated = projects.map(p => p.id === projectId ? { ...p, name } : p);
    localStorage.setItem('dfm_projects', JSON.stringify(updated));
    setProjects(updated);
  };

  const updateChecklistItem = (itemId: string, field: 'standard' | 'remark', value: string) => {
    const updated = checklist.map(item => item.id === itemId ? { ...item, [field]: value } : item);
    localStorage.setItem('dfm_checklist', JSON.stringify(updated));
    setChecklist(updated);
  };

  const createProject = () => {
    if (!newProjectName.trim() || !user) return;
    const newP: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: newProjectName,
      createdAt: new Date().toISOString(),
      ownerId: user.uid,
      status: 'in-progress'
    };
    const updated = [...projects, newP];
    localStorage.setItem('dfm_projects', JSON.stringify(updated));
    setProjects(updated);
    setNewProjectName('');
    setShowNewProjectModal(false);
    openProject(newP);
  };

  const updateResult = (itemId: string, status: 'OK' | 'NG' | 'N/A', remark: string = '') => {
    if (!currentProject) return;
    const newResults = {
      ...results,
      [itemId]: {
        projectId: currentProject.id,
        checklistItemId: itemId,
        status,
        remark,
        updatedAt: new Date().toISOString()
      }
    };
    setResults(newResults);
    localStorage.setItem(`dfm_results_${currentProject.id}`, JSON.stringify(newResults));
  };

  const addLesson = (title: string, content: string, category: string) => {
    if (!user) return;
    const newL: LessonLearned = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      content,
      category,
      createdAt: new Date().toISOString(),
      authorId: user.uid
    };
    const updated = [...lessons, newL];
    localStorage.setItem('dfm_lessons', JSON.stringify(updated));
    setLessons(updated);
  };

  // --- PDF Handling ---

  const handleDfmUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event: any) => {
      const typedarray = new Uint8Array(event.target.result);
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      renderPage(1, pdf);
    };
    reader.readAsArrayBuffer(file);
  };

  const renderPage = async (pageNum: number, pdfInstance = pdfDoc) => {
    if (!pdfInstance) return;
    
    const page = await pdfInstance.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 * zoom }); // Increased base scale
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;

    // Draw markers
    markers.filter(m => m.page === pageNum).forEach(marker => {
      const x = marker.x * canvas.width;
      const y = marker.y * canvas.height;
      
      context.beginPath();
      context.arc(x, y, 15, 0, 2 * Math.PI);
      context.fillStyle = marker.type === 'OK' ? '#22c55e' : '#ef4444';
      context.fill();
      context.strokeStyle = 'white';
      context.lineWidth = 2;
      context.stroke();
      
      context.fillStyle = 'white';
      context.font = 'bold 12px Inter';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(marker.type, x, y);
      
      if (marker.type === 'NG' && marker.remark) {
        context.fillStyle = 'black';
        context.font = '10px Inter';
        context.textAlign = 'left';
        context.fillText(marker.remark, x + 20, y);
      }
    });

    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    setPageImage(base64Image);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !currentProject) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const isOK = confirm("Mark as OK? (Cancel for NG)");
    const type = isOK ? 'OK' : 'NG';
    let remark = '';
    
    if (!isOK) {
      const reason = prompt("Enter reason for NG:");
      if (reason === null) return; // User cancelled the prompt
      remark = reason;
    }

    const newMarker: { x: number, y: number, type: 'OK' | 'NG', page: number, remark?: string } = { 
      x, y, type, page: currentPage, remark 
    };
    const newMarkers = [...markers, newMarker];
    setMarkers(newMarkers);
    
    // Redraw with new marker
    renderPage(currentPage);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
    }
  };

  const handleStampDrag = (e: React.MouseEvent, id: string) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    updateStampPos(id, x, y);
  };

  const suggestLessonLearned = async () => {
    if (!pageImage) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const model = "gemini-3-flash-preview";

    const prompt = `
      Based on the DFM page provided, suggest a concise "Lesson Learned" or a "Standard Update".
      Include a relevant tag and the standard it relates to.
      
      Return your response in JSON format:
      {
        "title": "Short title",
        "content": "Concise lesson content",
        "category": "Category",
        "tag": "Short tag",
        "standard": "Related standard"
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          { parts: [{ text: prompt }, { inlineData: { data: pageImage, mimeType: "image/jpeg" } }] }
        ],
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '{}');
      setLessonSuggestion(data);
      setShowLessonPrompt(true); // Show the modal
    } catch (error) {
      console.error("Lesson suggestion failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNextPage = async () => {
    if (currentPage < totalPages) {
      // Before moving, suggest a lesson learned
      await suggestLessonLearned();
      setShowLessonPrompt(true);
    } else {
      alert("This is the last page.");
    }
  };

  const confirmNextPage = () => {
    setShowLessonPrompt(false);
    setLessonSuggestion(null);
    const next = currentPage + 1;
    setCurrentPage(next);
    renderPage(next);
  };

  const addStamp = (type: Stamp['type']) => {
    if (!user) return;
    let text = type === 'NAME' ? user.displayName || 'User' : 
                 type === 'DATE' ? new Date().toLocaleDateString() : type;
    
    if (type === 'NG') {
      const reason = prompt("Enter reason for NG:");
      if (reason === null) return;
      text = reason.trim() ? `NG: ${reason}` : 'NG';
    }

    const newStamp: Stamp = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      text,
      x: 0.5,
      y: 0.5,
      page: currentPage
    };
    setStamps(prev => [...prev, newStamp]);
  };

  const updateStampPos = (id: string, x: number, y: number) => {
    setStamps(prev => prev.map(s => s.id === id ? { ...s, x, y } : s));
  };

  const removeStamp = (id: string) => {
    setStamps(prev => prev.filter(s => s.id !== id));
  };

  const askAI = async () => {
    if (!pageImage) return;
    setIsAnalyzing(true);
    setShowAiResults(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const model = "gemini-3-flash-preview";

    const checklistContext = checklist.map(item => `- [${item.id}] ${item.item} > ${item.subItem}: ${item.checkPoint}`).join('\n');
    const lessonsContext = lessons.map(l => `- Lesson: ${l.title} (${l.category}): ${l.content}`).join('\n');

    const prompt = `
      You are a DFM (Design for Manufacturing) expert. 
      Analyze the attached DFM document image (Page ${currentPage} of ${totalPages}).
      
      1. Identify which parts of the DFM checklist are relevant to this specific page.
      2. Provide a VERY CONCISE analysis:
         - Issue: [Brief description of the issue]
         - Solution: [Brief solution]
         - Reference: [Standard or previous lesson]
         - Suggestion: OK, NG, or N/A.
      
      If there are multiple issues, number them and use bold for the numbers (e.g., **1.**, **2.**).
      Keep it as short as possible.
      
      Master Checklist Items:
      ${checklistContext}
      
      Lessons Learned Database:
      ${lessonsContext}
      
      Return your response in JSON format:
      {
        "summary": "Expert summary of the page",
        "issue": "Concise issue list",
        "solution": "Concise solution list",
        "reference": "Concise reference",
        "suggestion": "OK" | "NG" | "N/A",
        "relevantItemIds": ["id1", "id2", ...]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          { parts: [{ text: prompt }, { inlineData: { data: pageImage, mimeType: "image/jpeg" } }] }
        ],
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || '{}');
      setAiAnalysis(data);
      setSuggestedItems(data.relevantItemIds || []);
      
      // Auto-expand groups that have suggested items
      const newCollapsed = { ...collapsedGroups };
      checklist.forEach(item => {
        if (data.relevantItemIds?.includes(item.id)) {
          newCollapsed[item.item] = false;
        }
      });
      setCollapsedGroups(newCollapsed);
    } catch (error) {
      console.error("AI Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openProject = (project: Project) => {
    setCurrentProject(project);
    fetchResults(project.id);
    setView('project');
    setAiAnalysis(null);
    setSuggestedItems([]);
    setPdfDoc(null);
    setCurrentPage(1);
    setPageImage(null);
  };

  // --- Render Helpers ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-200">
              <FileText className="text-white" size={40} />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">DFM Tooling Support</h1>
            <p className="text-gray-500">Intelligent DFM checklist and lessons learned platform.</p>
          </div>
          <Button onClick={login} className="w-full py-4 text-lg shadow-lg" icon={Search}>
            Sign in with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-100">
              <FileText className="text-white" size={24} />
            </div>
            <span className="text-xl font-bold text-gray-900 hidden sm:block">DFM Tooling</span>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-1">
              <Button variant="ghost" onClick={() => setView('dashboard')} className={view === 'dashboard' ? 'bg-gray-100 text-blue-600' : ''}>Dashboard</Button>
              <Button variant="ghost" onClick={() => setView('lessons')} className={view === 'lessons' ? 'bg-gray-100 text-blue-600' : ''}>Lessons Learned</Button>
            </nav>
            <div className="h-8 w-px bg-gray-200 mx-2 hidden md:block"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
                  <p className="text-gray-500">Manage your DFM checks and evaluations.</p>
                </div>
                <Button onClick={() => setShowNewProjectModal(true)} icon={Plus}>New Project</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(project => (
                  <Card key={project.id} className="hover:border-blue-300 transition-colors cursor-pointer group" onClick={() => openProject(project)}>
                    <div className="p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                        <Badge variant={project.status === 'completed' ? 'success' : 'warning'}>
                          {project.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <History size={14} />
                        {project.createdAt?.toDate ? project.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </div>
                      <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); const name = prompt("New name:", project.name); if (name) updateProject(project.id, name); }}
                            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                          >
                            <FileText size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'project' && currentProject && (
            <motion.div 
              key="project"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" onClick={() => setView('dashboard')} icon={ArrowLeft}>Back</Button>
                  <div className="h-8 w-px bg-gray-200"></div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{currentProject.name}</h2>
                    <div className="flex items-center gap-2">
                      <Badge variant={currentProject.status === 'completed' ? 'success' : 'warning'}>{currentProject.status}</Badge>
                    </div>
                  </div>
                </div>
                
                  <div className="flex items-center gap-2">
                    <input type="file" ref={checksheetInputRef} className="hidden" accept=".xlsx,.xls,.csv" />
                    <Button variant={showChecklist ? "primary" : "outline"} icon={FileText} onClick={() => setShowChecklist(!showChecklist)}>
                      {showChecklist ? "Hide Checklist" : "Show Checklist"}
                    </Button>
                    
                    <input type="file" ref={dfmInputRef} className="hidden" accept="application/pdf" onChange={handleDfmUpload} />
                    <Button variant="primary" icon={Upload} onClick={() => dfmInputRef.current?.click()}>Upload DFM PDF</Button>

                    {pdfDoc && (
                      <>
                        <div className="h-8 w-px bg-gray-200 mx-1"></div>
                        <Button variant="outline" icon={Save} onClick={() => alert("DFM state saved successfully!")}>Save DFM</Button>
                        <Button variant="ghost" icon={FileText} onClick={() => dfmInputRef.current?.click()}>Edit DFM</Button>
                      </>
                    )}
                  </div>
              </div>

              <div className="flex flex-row gap-6 h-[calc(100vh-200px)]">
                {/* Left: PDF Viewer */}
                <div style={{ width: showChecklist ? `${panelWidth}%` : '100%' }} className="flex flex-col gap-6 overflow-hidden relative transition-all duration-300">
                  <Card className="p-0 bg-gray-800 flex-1 flex flex-col relative overflow-hidden">
                    <div className="p-3 bg-gray-900 text-white flex items-center justify-between z-10">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium">DFM Document</span>
                        {pdfDoc && (
                          <div className="flex items-center gap-2 bg-gray-700 px-2 py-1 rounded">
                            <button 
                              disabled={currentPage <= 1 || isAnalyzing}
                              onClick={() => { setCurrentPage(p => p - 1); renderPage(currentPage - 1); }}
                              className="p-1 hover:bg-gray-600 rounded disabled:opacity-30"
                            >
                              <ArrowLeft size={16} />
                            </button>
                            <span className="text-xs">Page {currentPage} of {totalPages}</span>
                            <button 
                              disabled={currentPage >= totalPages || isAnalyzing}
                              onClick={() => { setCurrentPage(p => p + 1); renderPage(currentPage + 1); }}
                              className="p-1 hover:bg-gray-600 rounded disabled:opacity-30"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        )}
                        {isAnalyzing && (
                          <div className="flex items-center gap-2 text-blue-400 text-xs font-medium animate-pulse">
                            <Loader2 size={14} className="animate-spin" />
                            AI is thinking...
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {pdfDoc && (
                          <>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={() => addStamp('OK')}>+ OK</Button>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={() => addStamp('NG')}>+ NG</Button>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={() => addStamp('NAME')}>+ Name</Button>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={() => addStamp('DATE')}>+ Date</Button>
                            <div className="w-px h-4 bg-gray-700 mx-2"></div>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={askAI} icon={MessageSquare} disabled={isAnalyzing}>Ask AI</Button>
                            <Button variant="ghost" size="sm" className="text-xs text-white hover:bg-gray-700" onClick={suggestLessonLearned} icon={Lightbulb} disabled={isAnalyzing}>Lesson</Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 flex items-start justify-center p-4 overflow-auto bg-gray-700 scrollbar-hide relative min-h-0" onWheel={handleWheel}>
                      <div className="relative my-4" style={{ transform: `scale(${zoom})`, transformOrigin: 'center top', transition: 'transform 0.1s ease-out' }}>
                        <canvas 
                          ref={canvasRef} 
                          onClick={handleCanvasClick}
                          className="shadow-2xl bg-white cursor-crosshair" 
                        />
                        {/* Render Stamps */}
                        {stamps.filter(s => s.page === currentPage).map(stamp => (
                          <motion.div
                            key={stamp.id}
                            drag
                            dragMomentum={false}
                            onDragEnd={(_, info) => {
                              if (!canvasRef.current) return;
                              const rect = canvasRef.current.getBoundingClientRect();
                              // Calculate relative position based on the pointer position relative to the canvas
                              const x = (info.point.x - rect.left) / rect.width;
                              const y = (info.point.y - rect.top) / rect.height;
                              updateStampPos(stamp.id, x, y);
                            }}
                            style={{ 
                              position: 'absolute', 
                              left: `${stamp.x * 100}%`, 
                              top: `${stamp.y * 100}%`,
                              transform: 'translate(-50%, -50%)',
                              zIndex: 50
                            }}
                            className={`px-3 py-1 rounded shadow-lg font-bold text-sm cursor-move select-none flex items-center gap-2 whitespace-nowrap ${
                              stamp.type === 'OK' ? 'bg-green-500 text-white' : 
                              stamp.type === 'NG' ? 'bg-red-500 text-white' : 
                              'bg-white text-gray-800 border border-gray-300'
                            }`}
                          >
                            {stamp.text}
                            <button onClick={(e) => { e.stopPropagation(); removeStamp(stamp.id); }} className="hover:opacity-70">
                              <X size={12} />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                      {!pdfDoc && (
                        <div className="text-center text-gray-400 space-y-4">
                          <FileText size={64} className="mx-auto opacity-20" />
                          <p>Upload a DFM PDF to start the review</p>
                          <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-600" onClick={() => dfmInputRef.current?.click()}>Select PDF</Button>
                        </div>
                      )}
                      
                      {pdfDoc && (
                        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
                          <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:bg-white transition-all">
                            <Plus size={20} />
                          </button>
                          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:bg-white transition-all">
                            <X size={20} className="rotate-45" />
                          </button>
                          <button onClick={() => setZoom(1)} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:bg-white transition-all text-xs font-bold">
                            1:1
                          </button>
                        </div>
                      )}
                    </Card>

                  {/* AI Analysis Overlay (Floating) */}
                  <AnimatePresence>
                    {showAiResults && aiAnalysis && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="absolute bottom-6 left-6 right-6 z-40"
                      >
                        <Card className="p-5 border-blue-200 bg-white/95 backdrop-blur shadow-2xl space-y-4 max-h-[300px] overflow-y-auto">
                          <div className="flex justify-between items-center sticky top-0 bg-white/95 py-1 z-10">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                              <Lightbulb size={18} className="text-blue-600" />
                              AI Expert Analysis
                            </h3>
                            <div className="flex items-center gap-2">
                              {aiAnalysis.suggestion && (
                                <Badge variant={aiAnalysis.suggestion === 'OK' ? 'success' : 'error'}>
                                  {aiAnalysis.suggestion}
                                </Badge>
                              )}
                              <button onClick={() => setShowAiResults(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            {aiAnalysis.issue && (
                              <div className="text-sm text-gray-700">
                                <span className="font-bold text-red-600">Issue: </span>
                                <div className="pl-4 whitespace-pre-line">
                                  <Markdown>{aiAnalysis.issue}</Markdown>
                                </div>
                              </div>
                            )}
                            {aiAnalysis.solution && (
                              <div className="text-sm text-gray-700">
                                <span className="font-bold text-green-600">Solution: </span>
                                <div className="pl-4 whitespace-pre-line">
                                  <Markdown>{aiAnalysis.solution}</Markdown>
                                </div>
                              </div>
                            )}
                            {aiAnalysis.reference && (
                              <div className="text-sm text-gray-500 italic">
                                <span className="font-bold">Ref: </span>
                                {aiAnalysis.reference}
                              </div>
                            )}
                            {aiAnalysis.summary && !aiAnalysis.issue && (
                              <div className="text-sm text-gray-600 italic">
                                {aiAnalysis.summary}
                              </div>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Resizer */}
                {showChecklist && (
                  <div 
                    className="w-1 hover:w-2 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-all h-full rounded-full"
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const startWidth = panelWidth;
                      const onMouseMove = (moveEvent: MouseEvent) => {
                        const delta = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
                        setPanelWidth(Math.min(Math.max(startWidth + delta, 30), 80));
                      };
                      const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                      };
                      document.addEventListener('mousemove', onMouseMove);
                      document.addEventListener('mouseup', onMouseUp);
                    }}
                  />
                )}

                {/* Right: Checklist */}
                <AnimatePresence>
                  {showChecklist && (
                    <motion.div 
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: `${100 - panelWidth}%`, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="flex flex-col gap-6 overflow-hidden"
                    >
                      <Card className="flex flex-col h-full">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <div className="space-y-1">
                        <h3 className="font-bold text-gray-900">Checklist Evaluation</h3>
                        <button 
                          onClick={() => setShowAllChecklist(!showAllChecklist)}
                          className="text-[10px] font-bold text-blue-600 uppercase hover:underline"
                        >
                          {showAllChecklist ? 'Show AI Matches Only' : 'Show All Items'}
                        </button>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1 text-xs text-green-600 font-bold">
                          <CheckCircle2 size={14} />
                          {Object.values(results).filter(r => r.status === 'OK').length}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-red-600 font-bold">
                          <XCircle size={14} />
                          {Object.values(results).filter(r => r.status === 'NG').length}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                      {Array.from(new Set(checklist.map(i => i.item))).map(groupName => {
                        const groupItems = checklist.filter(i => i.item === groupName);
                        const visibleItems = showAllChecklist 
                          ? groupItems 
                          : groupItems.filter(i => suggestedItems.includes(i.id));
                        
                        if (visibleItems.length === 0) return null;

                        const isCollapsed = collapsedGroups[groupName] ?? true;

                        return (
                          <div key={groupName} className="border-b border-gray-100 last:border-0">
                            <button 
                              onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !isCollapsed }))}
                              className="w-full p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                            >
                              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{groupName}</span>
                              <ChevronRight size={16} className={`text-gray-400 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
                            </button>
                            
                            {!isCollapsed && (
                              <div className="divide-y divide-gray-100">
                                {visibleItems.map(item => {
                                  const result = results[item.id];
                                  const isSuggested = suggestedItems.includes(item.id);
                                  
                                  return (
                                    <div key={item.id} className={`p-4 transition-all ${isSuggested ? 'bg-blue-50/30 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}>
                                      <div className="space-y-2">
                                        <div className="flex justify-between items-start gap-2">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              {isSuggested && <Badge variant="info">AI Match</Badge>}
                                              <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.subItem}: {item.checkPoint}</h4>
                                            </div>
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <button 
                                              onClick={() => updateResult(item.id, 'OK')}
                                              className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${result?.status === 'OK' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}
                                            >
                                              <Check size={16} />
                                            </button>
                                            <button 
                                              onClick={() => {
                                                const remark = prompt("Enter remark for NG status:", result?.remark || "");
                                                if (remark !== null) updateResult(item.id, 'NG', remark);
                                              }}
                                              className={`w-8 h-8 flex items-center justify-center rounded-md transition-all ${result?.status === 'NG' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'}`}
                                            >
                                              <X size={16} />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs text-gray-500 italic flex items-center gap-2">
                                            Standard: 
                                            <input 
                                              type="text" 
                                              value={item.standard || ''} 
                                              onChange={(e) => updateChecklistItem(item.id, 'standard', e.target.value)}
                                              className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1 py-0.5 w-full"
                                            />
                                          </p>
                                          <p className="text-xs text-gray-400 italic flex items-center gap-2">
                                            Remark: 
                                            <input 
                                              type="text" 
                                              value={item.remark || ''} 
                                              onChange={(e) => updateChecklistItem(item.id, 'remark', e.target.value)}
                                              className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none px-1 py-0.5 w-full italic"
                                            />
                                          </p>
                                        </div>
                                        {result?.status === 'NG' && (
                                          <div className="p-2 bg-red-50 border border-red-100 rounded text-[11px] text-red-700">
                                            <strong>Remark:</strong> {result.remark}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          )}

          {view === 'lessons' && (
            <motion.div 
              key="lessons"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Lessons Learned</h2>
                  <p className="text-gray-500">Historical data and standards updates for DFM optimization.</p>
                </div>
                <Button onClick={() => {
                  const title = prompt("Enter lesson title:");
                  const content = prompt("Enter lesson content:");
                  const category = prompt("Enter category (e.g., Mold Flow, Cooling):");
                  if (title && content && category) addLesson(title, content, category);
                }} icon={Plus}>Add Lesson</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {lessons.map(lesson => (
                  <Card key={lesson.id} className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <Badge variant="info">{lesson.category}</Badge>
                        <h3 className="text-xl font-bold text-gray-900">{lesson.title}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{lesson.createdAt?.toDate ? lesson.createdAt.toDate().toLocaleDateString() : 'Just now'}</p>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-600">
                      <Markdown>{lesson.content}</Markdown>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Lesson Learned Prompt Modal */}
      {showLessonPrompt && lessonSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6"
          >
            <div className="flex items-center gap-3 text-blue-600">
              <Lightbulb size={32} />
              <h3 className="text-xl font-bold text-gray-900">Add Lesson Learned?</h3>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="info">{lessonSuggestion.category}</Badge>
                <Badge variant="warning">{lessonSuggestion.tag}</Badge>
              </div>
              <h4 className="font-bold text-gray-900">{lessonSuggestion.title}</h4>
              <p className="text-sm text-gray-700">{lessonSuggestion.content}</p>
              <div className="pt-2 border-t border-blue-200">
                <p className="text-xs text-gray-500 font-medium">Related Standard: {lessonSuggestion.standard}</p>
              </div>
            </div>

            <p className="text-sm text-gray-500">Would you like to save this lesson to the database before moving to the next page?</p>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={confirmNextPage}>Skip</Button>
              <Button className="flex-1" onClick={() => {
                addLesson(lessonSuggestion.title, lessonSuggestion.content, lessonSuggestion.category);
                confirmNextPage();
              }} icon={Save}>Save & Next</Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">New DFM Project</h3>
              <button onClick={() => setShowNewProjectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Project Name</label>
              <input 
                type="text" 
                value={newProjectName} 
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., Front Cover Tooling V1"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowNewProjectModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createProject} disabled={!newProjectName.trim()}>Create</Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">© 2026 DFM Tooling Support System • Powered by Google AI</p>
        </div>
      </footer>
    </div>
  );
}
