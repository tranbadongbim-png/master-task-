import React, { useState, useEffect, useRef } from 'react';
import { 
  Moon, Sun, Plus, Trash2, Menu, LayoutDashboard, 
  CheckCircle2, Circle, Clock, X, Check, AlignLeft, CheckSquare,
  Search, ArrowUpDown, Settings, ArrowLeft, Flag,
  ArrowUp, ArrowRight, ArrowDown, Edit2, Filter, BarChart3, Calendar, User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { format, isPast, isToday, parseISO, addDays } from 'date-fns';
import { Card, Task, Subtask, TaskStatus, TaskPriority, User } from './types';
import { USERS } from './constants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import "mobile-drag-drop/default.css";

// Polyfill for mobile drag and drop
polyfill({
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
  holdToDrag: 300 // 300ms long press to start dragging on mobile
});

// Prevent scrolling while dragging
window.addEventListener('touchmove', () => {}, { passive: false });

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [users, setUsers] = useState<User[]>(USERS);
  const [activeCardId, setActiveCardId] = useLocalStorage<string | null>('taskmaster_active_card', null);
  const [isDarkMode, setIsDarkMode] = useLocalStorage<boolean>('taskmaster_theme', false);
  
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardTitle, setEditingCardTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [filterPriority, setFilterPriority] = useState<'all' | TaskPriority>('all');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'board' | 'settings' | 'analytics'>('board');
  const [activeTab, setActiveTab] = useState<'all' | TaskStatus>('all');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (cards.length > 0 && !activeCardId) {
      setActiveCardId(cards[0].id);
    } else if (cards.length === 0 && activeCardId) {
      setActiveCardId(null);
    }
  }, [cards, activeCardId, setActiveCardId]);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(data => {
        if (data.error === "Not configured") {
          setIsConfigured(false);
          setIsLoading(false);
          return;
        }
        setIsConfigured(true);
        setCards(data.cards || []);
        setTasks(data.tasks || []);
        setSubtasks(data.subtasks || []);
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
        }
        setIsLoading(false);
        setInitialLoadDone(true);
      })
      .catch(err => {
        console.error("Failed to fetch data", err);
        setIsLoading(false);
      });
  }, []);

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!isConfigured || !initialLoadDone) return;
    
    // Prevent syncing the data immediately after loading it
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards, tasks, subtasks, users })
      }).catch(err => console.error("Failed to sync data", err));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [cards, tasks, subtasks, isConfigured, initialLoadDone]);

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardTitle.trim()) return;
    const newCard: Card = {
      id: generateId(),
      title: newCardTitle.trim(),
      createdAt: Date.now(),
    };
    setCards([...cards, newCard]);
    setActiveCardId(newCard.id);
    setActiveView('board');
    setNewCardTitle('');
    setIsAddingCard(false);
  };

  const handleUpdateCard = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editingCardTitle.trim()) {
      setEditingCardId(null);
      return;
    }
    setCards(cards.map(c => c.id === id ? { ...c, title: editingCardTitle.trim() } : c));
    setEditingCardId(null);
  };

  const handleDeleteCard = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa thẻ này và tất cả công việc bên trong?')) {
      setCards(cards.filter(c => c.id !== id));
      setTasks(tasks.filter(t => t.cardId !== id));
      const tasksToDelete = tasks.filter(t => t.cardId === id).map(t => t.id);
      setSubtasks(subtasks.filter(st => !tasksToDelete.includes(st.taskId)));
      if (activeCardId === id) {
        setActiveCardId(cards.length > 1 ? cards.find(c => c.id !== id)?.id || null : null);
      }
    }
  };

  const handleAddTask = (status: TaskStatus) => {
    if (!activeCardId) return;
    const newTask: Task = {
      id: generateId(),
      cardId: activeCardId,
      title: 'Công việc mới',
      description: '',
      status,
      priority: 'medium',
      createdAt: Date.now(),
    };
    setTasks([...tasks, newTask]);
    setEditingTask(newTask);
  };

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const activeCard = cards.find(c => c.id === activeCardId);
  const activeTasks = tasks.filter(t => t.cardId === activeCardId);

  const filteredAndSortedTasks = activeTasks
    .filter(t => 
      (t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (filterPriority === 'all' || t.priority === filterPriority)
    )
    .sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'az') return a.title.localeCompare(b.title);
      if (sortBy === 'za') return b.title.localeCompare(a.title);
      return 0;
    });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p>Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  const handleAddUser = () => {
    const newUser: User = {
      id: generateId(),
      name: 'Thành viên mới',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
    };
    setUsers([...users, newUser]);
  };

  const handleUpdateUser = (id: string, updates: Partial<User>) => {
    setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
  };

  const handleDeleteUser = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa thành viên này? Các công việc đã gán cho họ sẽ không còn người thực hiện.')) {
      setUsers(users.filter(u => u.id !== id));
      setTasks(tasks.map(t => t.assigneeId === id ? { ...t, assigneeId: undefined } : t));
    }
  };

  if (isConfigured === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 p-6">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center border border-slate-200 dark:border-zinc-800">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Chưa cấu hình Cloudflare D1</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Ứng dụng này sử dụng Cloudflare D1 để lưu trữ dữ liệu. Vui lòng cấu hình các biến môi trường sau trong AI Studio:
          </p>
          <div className="text-left bg-slate-100 dark:bg-zinc-950 p-4 rounded-xl font-mono text-sm mb-6 overflow-x-auto border border-slate-200 dark:border-zinc-800">
            <div className="text-indigo-600 dark:text-indigo-400 mb-1">CLOUDFLARE_ACCOUNT_ID</div>
            <div className="text-indigo-600 dark:text-indigo-400 mb-1">CLOUDFLARE_DATABASE_ID</div>
            <div className="text-indigo-600 dark:text-indigo-400">CLOUDFLARE_API_TOKEN</div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sau khi cấu hình, ứng dụng sẽ tự động kết nối và khởi tạo cơ sở dữ liệu.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex overflow-hidden transition-colors duration-200 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white dark:bg-black border-r border-slate-200 dark:border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 font-bold text-xl text-indigo-600 dark:text-indigo-400 cursor-pointer"
            onClick={() => {
              setActiveView('board');
              setIsSidebarOpen(false);
            }}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span>TaskMaster</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
            Các thẻ của tôi
          </div>
          <div className="space-y-1">
            {cards.map(card => (
              <div 
                key={card.id}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${activeCardId === card.id && activeView === 'board' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}
                onClick={() => {
                  if (editingCardId === card.id) return;
                  setActiveCardId(card.id);
                  setActiveView('board');
                  setIsSidebarOpen(false);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingCardId(card.id);
                  setEditingCardTitle(card.title);
                }}
              >
                {editingCardId === card.id ? (
                  <form 
                    onSubmit={(e) => handleUpdateCard(e, card.id)} 
                    className="flex-1 mr-2"
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editingCardTitle}
                      onChange={(e) => setEditingCardTitle(e.target.value)}
                      onBlur={(e) => handleUpdateCard(e, card.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white dark:bg-zinc-800 border border-indigo-300 dark:border-indigo-500 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </form>
                ) : (
                  <span className="font-medium truncate pr-2 flex-1">{card.title}</span>
                )}
                
                {editingCardId !== card.id && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setEditingCardId(card.id);
                        setEditingCardTitle(card.title);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                      title="Sửa tên thẻ"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                      title="Xóa thẻ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isAddingCard ? (
            <form onSubmit={handleAddCard} className="mt-2">
              <input
                type="text"
                autoFocus
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                placeholder="Tên thẻ mới..."
                className="w-full p-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                onBlur={() => {
                  if (!newCardTitle.trim()) setIsAddingCard(false);
                }}
              />
            </form>
          ) : (
            <button 
              onClick={() => setIsAddingCard(true)}
              className="mt-2 w-full flex items-center gap-2 p-3 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Thêm thẻ mới
            </button>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 mt-auto space-y-1">
          <button
            onClick={() => {
              setActiveView('analytics');
              setIsSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
              activeView === 'analytics' 
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium text-sm">Thống kê</span>
          </button>

          <button
            onClick={() => {
              setActiveView('settings');
              setIsSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
              activeView === 'settings' 
                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium text-sm">Cài đặt</span>
          </button>
          
          <div className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            <p>&copy; {new Date().getFullYear()} Master Task</p>
            <p className="mt-0.5">Design by Dong</p>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            {activeView === 'settings' && (
              <button 
                onClick={() => setActiveView('board')}
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400"
                title="Quay lại bảng công việc"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="font-bold text-lg lg:text-xl truncate">
              {activeView === 'settings' ? 'Cài đặt' : activeView === 'analytics' ? 'Thống kê tiến độ' : (activeCard ? activeCard.title : 'Chọn hoặc tạo một thẻ')}
            </h1>
          </div>
          {activeView !== 'settings' && (
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          )}
        </header>

        {/* Main Content Area */}
        {activeView === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50 dark:bg-black">
            <div className="max-w-3xl mx-auto space-y-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Cài đặt</h2>
              
              <section className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Giao diện</h3>
                <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                  <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="text-base font-medium text-slate-900 dark:text-white">Chế độ tối</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Chuyển đổi giữa chế độ sáng và tối</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${isDarkMode ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-zinc-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Quản lý thành viên</h3>
                  <button 
                    onClick={handleAddUser}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm thành viên
                  </button>
                </div>
                
                <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {users.map(user => (
                      <div key={user.id} className="p-4 flex items-center gap-4 group">
                        <div className="relative">
                          <img 
                            src={user.avatar} 
                            alt={user.name} 
                            className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700"
                            referrerPolicy="no-referrer"
                          />
                          <button 
                            onClick={() => {
                              const newSeed = Math.random();
                              handleUpdateUser(user.id, { avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newSeed}` });
                            }}
                            className="absolute -bottom-1 -right-1 p-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Đổi avatar ngẫu nhiên"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <div className="flex-1">
                          <input 
                            type="text"
                            value={user.name}
                            onChange={(e) => handleUpdateUser(user.id, { name: e.target.value })}
                            className="w-full bg-transparent border-none focus:ring-0 p-0 font-medium text-slate-900 dark:text-white outline-none"
                            placeholder="Tên thành viên"
                          />
                          <div className="text-xs text-slate-500 mt-0.5">ID: {user.id}</div>
                        </div>

                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <div className="p-8 text-center text-slate-500">
                        Chưa có thành viên nào. Hãy thêm thành viên mới!
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : activeView === 'analytics' ? (
          <AnalyticsView cards={cards} tasks={tasks} />
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 lg:p-8">
            {activeCard ? (
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="flex flex-col gap-4 mb-6 shrink-0">
                <div className="flex flex-row gap-2 sm:gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm công việc..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
                    <select 
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value as any)}
                      className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-2 sm:px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-colors"
                    >
                      <option value="all">Tất cả độ ưu tiên</option>
                      <option value="high">Cao</option>
                      <option value="medium">Trung bình</option>
                      <option value="low">Thấp</option>
                    </select>

                    <ArrowUpDown className="w-4 h-4 text-slate-400 hidden sm:block ml-1" />
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-2 sm:px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-colors"
                    >
                      <option value="newest">Mới nhất</option>
                      <option value="oldest">Cũ nhất</option>
                      <option value="az">A-Z</option>
                      <option value="za">Z-A</option>
                    </select>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button
                    onClick={() => setActiveTab('all')}
                    title="Tất cả Kanban"
                    className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800'}`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTab('todo')}
                    title="Chưa làm"
                    className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${activeTab === 'todo' ? 'bg-slate-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800'}`}
                  >
                    <Circle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTab('in_progress')}
                    title="Đang làm"
                    className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${activeTab === 'in_progress' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800'}`}
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTab('done')}
                    title="Hoàn thành"
                    className={`p-2.5 rounded-xl transition-colors flex items-center justify-center ${activeTab === 'done' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800'}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className={`flex flex-row gap-4 md:gap-6 flex-1 items-start overflow-x-auto overflow-y-hidden pb-4 snap-x snap-mandatory ${activeTab !== 'all' ? 'justify-center' : ''}`}>
                {(activeTab === 'all' || activeTab === 'todo') && (
                  <KanbanColumn 
                    title="Chưa làm" 
                    status="todo" 
                    icon={<Circle className="w-5 h-5 text-slate-400" />}
                    tasks={filteredAndSortedTasks.filter(t => t.status === 'todo')}
                    onAddTask={() => handleAddTask('todo')}
                    onEditTask={setEditingTask}
                    onStatusChange={handleStatusChange}
                    subtasks={subtasks}
                    draggedTaskId={draggedTaskId}
                    setDraggedTaskId={setDraggedTaskId}
                    users={users}
                    isFullWidth={activeTab !== 'all'}
                  />
                )}
                {(activeTab === 'all' || activeTab === 'in_progress') && (
                  <KanbanColumn 
                    title="Đang làm" 
                    status="in_progress" 
                    icon={<Clock className="w-5 h-5 text-blue-500" />}
                    tasks={filteredAndSortedTasks.filter(t => t.status === 'in_progress')}
                    onAddTask={() => handleAddTask('in_progress')}
                    onEditTask={setEditingTask}
                    onStatusChange={handleStatusChange}
                    subtasks={subtasks}
                    draggedTaskId={draggedTaskId}
                    setDraggedTaskId={setDraggedTaskId}
                    users={users}
                    isFullWidth={activeTab !== 'all'}
                  />
                )}
                {(activeTab === 'all' || activeTab === 'done') && (
                  <KanbanColumn 
                    title="Hoàn thành" 
                    status="done" 
                    icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    tasks={filteredAndSortedTasks.filter(t => t.status === 'done')}
                    onAddTask={() => handleAddTask('done')}
                    onEditTask={setEditingTask}
                    onStatusChange={handleStatusChange}
                    subtasks={subtasks}
                    draggedTaskId={draggedTaskId}
                    setDraggedTaskId={setDraggedTaskId}
                    users={users}
                    isFullWidth={activeTab !== 'all'}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <LayoutDashboard className="w-16 h-16 mb-4 opacity-20" />
              <p>Tạo một thẻ ở menu bên trái để bắt đầu</p>
            </div>
          )}
        </div>
        )}
      </main>

      {/* Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <TaskModal 
            task={editingTask} 
            onClose={() => setEditingTask(null)}
            onSave={(updatedTask) => {
              setTasks(tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
            }}
            onDelete={(id) => {
              setTasks(tasks.filter(t => t.id !== id));
              setSubtasks(subtasks.filter(st => st.taskId !== id));
              setEditingTask(null);
            }}
            subtasks={subtasks.filter(st => st.taskId === editingTask.id)}
            onAddSubtask={(title) => {
              setSubtasks([...subtasks, { id: generateId(), taskId: editingTask.id, title, isCompleted: false, createdAt: Date.now() }]);
            }}
            onUpdateSubtask={(id, updates) => {
              setSubtasks(subtasks.map(st => st.id === id ? { ...st, ...updates } : st));
            }}
            onDeleteSubtask={(id) => {
              setSubtasks(subtasks.filter(st => st.id !== id));
            }}
            users={users}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AnalyticsView({ cards, tasks }: { cards: Card[], tasks: Task[] }) {
  const statsByCard = cards.map(card => {
    const cardTasks = tasks.filter(t => t.cardId === card.id);
    const total = cardTasks.length;
    const done = cardTasks.filter(t => t.status === 'done').length;
    const inProgress = cardTasks.filter(t => t.status === 'in_progress').length;
    const todo = cardTasks.filter(t => t.status === 'todo').length;
    
    return {
      name: card.title,
      total,
      done,
      inProgress,
      todo,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0
    };
  });

  const overallStats = [
    { name: 'Chưa làm', value: tasks.filter(t => t.status === 'todo').length, color: '#94a3b8' },
    { name: 'Đang làm', value: tasks.filter(t => t.status === 'in_progress').length, color: '#3b82f6' },
    { name: 'Hoàn thành', value: tasks.filter(t => t.status === 'done').length, color: '#10b981' },
  ].filter(s => s.value > 0);

  const priorityStats = [
    { name: 'Cao', value: tasks.filter(t => t.priority === 'high').length, color: '#ef4444' },
    { name: 'Trung bình', value: tasks.filter(t => t.priority === 'medium').length, color: '#f59e0b' },
    { name: 'Thấp', value: tasks.filter(t => t.priority === 'low').length, color: '#3b82f6' },
  ].filter(s => s.value > 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50 dark:bg-black">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Tổng số thẻ</h3>
            <p className="text-3xl font-bold">{cards.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Tổng số công việc</h3>
            <p className="text-3xl font-bold">{tasks.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Tỉ lệ hoàn thành</h3>
            <p className="text-3xl font-bold">
              {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <h3 className="font-semibold mb-6">Trạng thái công việc</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overallStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {overallStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <h3 className="font-semibold mb-6">Độ ưu tiên</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {priorityStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <h3 className="font-semibold mb-6">Tiến độ theo thẻ</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsByCard}>
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="todo" name="Chưa làm" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inProgress" name="Đang làm" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="done" name="Hoàn thành" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, status, icon, tasks, onAddTask, onEditTask, onStatusChange, subtasks, draggedTaskId, setDraggedTaskId, users, isFullWidth }: { 
  title: string, 
  status: TaskStatus, 
  icon: React.ReactNode, 
  tasks: Task[], 
  onAddTask: () => void,
  onEditTask: (task: Task) => void,
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void,
  subtasks: Subtask[],
  draggedTaskId: string | null,
  setDraggedTaskId: (id: string | null) => void,
  users: User[],
  isFullWidth?: boolean
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);

    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const rect = container.getBoundingClientRect();
      const threshold = 60; // Distance from edge to trigger scroll
      const scrollSpeed = 10;

      if (e.clientY - rect.top < threshold) {
        container.scrollTop -= scrollSpeed;
      } else if (rect.bottom - e.clientY < threshold) {
        container.scrollTop += scrollSpeed;
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (draggedTaskId) {
      onStatusChange(draggedTaskId, status);
      setDraggedTaskId(null);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-shrink-0 flex flex-col max-h-full rounded-2xl border transition-all duration-200 snap-start ${isFullWidth ? 'w-full max-w-5xl mx-auto' : 'w-[85vw] md:w-80'} ${isDragOver ? 'bg-indigo-50/80 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 border-dashed shadow-inner ring-4 ring-indigo-400/10' : 'bg-slate-100/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800'}`}
    >
      <div className={`p-4 flex items-center justify-between border-b transition-colors ${isDragOver ? 'border-indigo-200 dark:border-indigo-800/50' : 'border-slate-200 dark:border-zinc-800'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          <span>{title}</span>
          <span className="bg-slate-200 dark:bg-slate-800 text-xs py-0.5 px-2 rounded-full ml-2">
            {tasks.length}
          </span>
        </div>
        <button onClick={onAddTask} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto p-3 ${isFullWidth ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start' : 'flex flex-col gap-3'}`}
      >
        <AnimatePresence>
          {tasks.map(task => {
            const taskSubtasks = subtasks.filter(st => st.taskId === task.id);
            const completedSubtasks = taskSubtasks.filter(st => st.isCompleted).length;
            
            return (
              <motion.div 
                layout
                layoutId={task.id}
                key={task.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={
                  task.status === 'done' 
                    ? { opacity: 0.65, y: 0, scale: [1, 1.05, 0.98], transition: { duration: 0.4 } }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                draggable
                onDragStart={(e: any) => {
                  setDraggedTaskId(task.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDraggedTaskId(null)}
                onClick={() => onEditTask(task)}
                className={`bg-white dark:bg-zinc-950 p-3 rounded-xl shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group relative overflow-hidden ${
                  draggedTaskId === task.id 
                    ? 'opacity-50 scale-95 border-indigo-300 dark:border-indigo-700 shadow-none' 
                    : task.status === 'in_progress'
                      ? 'border-blue-300 dark:border-blue-800/60 shadow-blue-100/50 dark:shadow-none'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                } ${
                  task.priority === 'high' ? 'bg-red-50/30 dark:bg-red-900/10' :
                  task.priority === 'medium' ? 'bg-amber-50/30 dark:bg-amber-900/10' :
                  task.priority === 'low' ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                }`}
              >
                {task.status === 'in_progress' && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                )}
                <div className="flex justify-between items-start mb-2 gap-2">
                  <h3 className={`font-medium text-sm transition-colors flex items-start gap-1.5 ${task.status === 'done' ? 'text-slate-500 dark:text-slate-400' : 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`}>
                    {task.status === 'in_progress' && (
                      <Clock className="w-4 h-4 text-blue-500 animate-pulse shrink-0 mt-0.5" />
                    )}
                    {task.status === 'done' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    <span className={`leading-tight ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
                  </h3>
                  <div 
                    className="flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-md p-0.5 shrink-0" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button 
                      onClick={() => onStatusChange(task.id, 'todo')} 
                      className={`p-1 rounded transition-all ${task.status === 'todo' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-700 dark:text-slate-200' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      title="Chưa làm"
                    >
                      <Circle className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => onStatusChange(task.id, 'in_progress')} 
                      className={`p-1 rounded transition-all ${task.status === 'in_progress' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-500' : 'text-slate-400 hover:text-blue-400'}`}
                      title="Đang làm"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => onStatusChange(task.id, 'done')} 
                      className={`p-1 rounded transition-all ${task.status === 'done' ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-500' : 'text-slate-400 hover:text-emerald-400'}`}
                      title="Hoàn thành"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {task.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                    {task.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-auto pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                  {task.priority && (
                    <div 
                      className={`flex items-center justify-center w-5 h-5 rounded-md ${
                        task.priority === 'high' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                        task.priority === 'medium' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                        'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}
                      title={task.priority === 'high' ? 'Cao' : task.priority === 'medium' ? 'Trung bình' : 'Thấp'}
                    >
                      {task.priority === 'high' ? <ArrowUp className="w-3 h-3" /> :
                       task.priority === 'medium' ? <ArrowRight className="w-3 h-3" /> :
                       <ArrowDown className="w-3 h-3" />}
                    </div>
                  )}

                  {task.dueDate && (
                    <div className={`flex items-center gap-1 text-[10px] font-medium ${
                      task.status === 'done' ? 'text-slate-400' :
                      isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate)) ? 'text-red-500' :
                      isToday(parseISO(task.dueDate)) ? 'text-amber-500' :
                      'text-slate-500 dark:text-slate-400'
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(task.dueDate), 'dd/MM')}
                    </div>
                  )}

                  {taskSubtasks.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      <CheckSquare className="w-3 h-3" />
                      <span>{completedSubtasks}/{taskSubtasks.length}</span>
                    </div>
                  )}

                  {task.assigneeId && (
                    <div className="ml-auto flex -space-x-2">
                      {(() => {
                        const user = users.find(u => u.id === task.assigneeId);
                        return user ? (
                          <img 
                            src={user.avatar} 
                            alt={user.name} 
                            title={user.name}
                            className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-950 bg-slate-100"
                            referrerPolicy="no-referrer"
                          />
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          {isDragOver && draggedTaskId && !tasks.some(t => t.id === draggedTaskId) && (
            <motion.div
              initial={{ opacity: 0, height: 0, scale: 0.9 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.9 }}
              className="border-2 border-dashed border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/30 rounded-xl min-h-[100px] flex items-center justify-center transition-all my-2"
            >
              <div className="flex flex-col items-center gap-2 text-indigo-500 dark:text-indigo-400">
                <ArrowDown className="w-5 h-5 animate-bounce" />
                <span className="text-sm font-medium">Thả công việc vào đây</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onSave, onDelete, subtasks, onAddSubtask, onUpdateSubtask, onDeleteSubtask, users }: {
  task: Task,
  onClose: () => void,
  onSave: (task: Task) => void,
  onDelete: (id: string) => void,
  subtasks: Subtask[],
  onAddSubtask: (title: string) => void,
  onUpdateSubtask: (id: string, updates: Partial<Subtask>) => void,
  onDeleteSubtask: (id: string) => void,
  users: User[],
}) {
  const [editedTask, setEditedTask] = useState(task);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleSave = () => {
    onSave(editedTask);
    onClose();
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtaskTitle.trim()) {
      onAddSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSave}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white dark:bg-black rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-transparent dark:border-zinc-800"
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            Chi tiết công việc
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { if(confirm('Xóa công việc này?')) onDelete(task.id); }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={handleSave} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            
            {/* Left Column: Title & Description */}
            <div className="md:col-span-2 space-y-6">
              <div>
                <input 
                  type="text"
                  value={editedTask.title}
                  onChange={(e) => setEditedTask({...editedTask, title: e.target.value})}
                  placeholder="Tên công việc"
                  className="w-full text-xl sm:text-2xl font-bold bg-transparent border-none focus:ring-0 p-0 placeholder-slate-300 dark:placeholder-slate-700 outline-none"
                />
                <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Tạo lúc: {new Date(editedTask.createdAt).toLocaleString('vi-VN')}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <AlignLeft className="w-4 h-4" />
                  Mô tả
                </div>
                <textarea 
                  value={editedTask.description}
                  onChange={(e) => setEditedTask({...editedTask, description: e.target.value})}
                  placeholder="Thêm mô tả chi tiết..."
                  className="w-full min-h-[120px] p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <CheckSquare className="w-4 h-4" />
                  Công việc con
                </div>
                
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence>
                    {subtasks.map(st => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        key={st.id} 
                        className={`flex items-center gap-3 group bg-slate-50 dark:bg-slate-800/30 p-2 rounded-lg border transition-all ${st.isCompleted ? 'border-transparent opacity-60' : 'border-slate-100 dark:border-slate-800'}`}
                      >
                        <motion.button 
                          whileTap={{ scale: 0.8 }}
                          onClick={() => onUpdateSubtask(st.id, { isCompleted: !st.isCompleted })}
                          className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${st.isCompleted ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}`}
                        >
                          <AnimatePresence>
                            {st.isCompleted && (
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                        <input 
                          type="text"
                          value={st.title}
                          onChange={(e) => onUpdateSubtask(st.id, { title: e.target.value })}
                          className={`flex-1 min-w-0 bg-transparent border-none focus:ring-0 p-0 outline-none text-sm transition-all duration-300 truncate ${st.isCompleted ? 'text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}
                        />
                        <button 
                          onClick={() => onDeleteSubtask(st.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <form onSubmit={handleAddSubtask} className="flex flex-row gap-2 mt-3">
                  <input 
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Nhập tên việc con..."
                    className="flex-1 bg-slate-100 dark:bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                  />
                  <button 
                    type="submit"
                    disabled={!newSubtaskTitle.trim()}
                    className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Status & Priority */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Trạng thái
                </div>
                <select 
                  value={editedTask.status}
                  onChange={(e) => setEditedTask({...editedTask, status: e.target.value as TaskStatus})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="todo">Chưa làm</option>
                  <option value="in_progress">Đang làm</option>
                  <option value="done">Hoàn thành</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Mức độ ưu tiên
                </div>
                <select 
                  value={editedTask.priority || 'medium'}
                  onChange={(e) => setEditedTask({...editedTask, priority: e.target.value as TaskPriority})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Hạn chót
                </div>
                <input 
                  type="date"
                  value={editedTask.dueDate || ''}
                  onChange={(e) => setEditedTask({...editedTask, dueDate: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  Người thực hiện
                </div>
                <select 
                  value={editedTask.assigneeId || ''}
                  onChange={(e) => setEditedTask({...editedTask, assigneeId: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">Chưa gán</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 flex justify-end">
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            Lưu thay đổi
          </button>
        </div>
      </motion.div>
    </div>
  );
}
