import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../hooks/useAuth';

interface Task {
  id: string;
  displayDate?: string;
  taskNumber?: number;
  taskYear?: number;
  hasManualIdentifier: boolean;
  fullTaskIdentifier: string;
  ilgiliKisi: string; // İlgili Kişi (Required person field)
  raporTuru: string; // Rapor/İş Türü (Required report type)
  not?: string; // Notes
  deadline?: string; // YYYY-MM-DD format
  status: 'active' | 'completed';
  createdAt: any;
  updatedAt: any;
  completedAt?: any;
  timeTrackedInSeconds?: number;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: any;
  updatedAt?: any;
  deadline?: string;
}

interface UserSuggestions {
  ilgiliKisiler: string[];
  raporTurleri: string[];
}

const Isler: React.FC = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'tasks' | 'projects' | 'timetracking' | 'calendar' | 'archive' | 'settings'>('dashboard');
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suggestions, setSuggestions] = useState<UserSuggestions>({ ilgiliKisiler: [], raporTurleri: [] });
  const [activeTimer, setActiveTimer] = useState<{taskId: string, currentTime: number, intervalId: any} | null>(null);
  
  // Listeners
  const [listeners, setListeners] = useState<{[key: string]: (() => void) | null}>({
    tasks: null, archive: null, projects: null, suggestions: null
  });
  
  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [confirmMessage, setConfirmMessage] = useState('');
  
  // Task form data
  const [taskFormData, setTaskFormData] = useState<Partial<Task & {editing: boolean}>>({});
  
  // Project form data  
  const [projectFormData, setProjectFormData] = useState<Partial<Project & {editing: boolean}>>({});
  
  // Filters
  const [taskFilters, setTaskFilters] = useState({
    text: '', person: '', type: '', status: 'all'
  });
  const [archiveFilters, setArchiveFilters] = useState({
    text: '', person: '', type: ''
  });
  
  // Dashboard settings
  const [dashboardPeriod, setDashboardPeriod] = useState<'1m' | '3m' | '6m' | 'all'>('1m');

  // Utility functions
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    console.log(`${type.toUpperCase()}: ${message}`);
  }, []);

  const standardizeName = (name: string) => {
    if (!name) return '';
    return name.trim().toLowerCase().split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatDate = (date: any) => {
    if (!date) return 'Tarih Yok';
    if (typeof date.toDate === 'function') {
      return date.toDate().toLocaleDateString('tr-TR');
    }
    return new Date(date).toLocaleDateString('tr-TR');
  };

  // Data loading function
  const loadData = useCallback(async () => {
    if (!user) return;
    
    // Detach existing listeners
    Object.values(listeners).forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    
    try {
      const userPath = `users/${user.uid}`;
      
      // Load active tasks with real-time listener
      const activeTasksQuery = query(collection(db, userPath, 'tasks'), where("status", "==", "active"));
      const unsubscribeActiveTasks = onSnapshot(activeTasksQuery, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
        setActiveTasks(tasks);
      }, (error) => {
        console.error("Active tasks listener error:", error);
      });
      
      // Load archived tasks with real-time listener  
      const archiveTasksQuery = query(collection(db, userPath, 'tasks'), where("status", "==", "completed"));
      const unsubscribeArchivedTasks = onSnapshot(archiveTasksQuery, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Task[];
        setArchivedTasks(tasks);
      }, (error) => {
        console.error("Archived tasks listener error:", error);
      });
      
      // Load projects with real-time listener
      const projectsQuery = query(collection(db, userPath, 'projects'), orderBy("createdAt", "desc"));
      const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
        const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];
        setProjects(projectsData);
      }, (error) => {
        console.error("Projects listener error:", error);
      });
      
      // Load suggestions
      const suggestionsRef = doc(db, userPath, 'suggestions', 'userSuggestions');
      const unsubscribeSuggestions = onSnapshot(suggestionsRef, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : {};
        setSuggestions({
          ilgiliKisiler: data.ilgiliKisiler || [],
          raporTurleri: data.raporTurleri || []
        });
      });
      
      setListeners({
        tasks: unsubscribeActiveTasks,
        archive: unsubscribeArchivedTasks,
        projects: unsubscribeProjects,
        suggestions: unsubscribeSuggestions
      });
      
    } catch (error) {
      console.error('İşler veri yükleme hatası:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      // Clean up listeners when user logs out
      Object.values(listeners).forEach(unsubscribe => {
        if (unsubscribe) unsubscribe();
      });
      setListeners({ tasks: null, archive: null, projects: null, suggestions: null });
    }
  }, [user, loadData]);
  
  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(listeners).forEach(unsubscribe => {
        if (unsubscribe) unsubscribe();
      });
    };
  }, []);

  // Add suggestion helper
  const addSuggestion = async (type: 'ilgiliKisi' | 'raporTuru', value: string) => {
    if (!user || !value.trim()) return;
    const ref = doc(db, `users/${user.uid}/suggestions`, 'userSuggestions');
    const listKey = type === 'ilgiliKisi' ? 'ilgiliKisiler' : 'raporTurleri';
    const list = suggestions[listKey] || [];
    if (!list.map(i => i.toLowerCase()).includes(value.trim().toLowerCase())) {
      const newList = [...list, standardizeName(value)].sort((a, b) => a.localeCompare(b, 'tr'));
      await setDoc(ref, { [listKey]: newList }, { merge: true });
    }
  };

  // Delete suggestion helper
  const deleteSuggestion = async (type: 'ilgiliKisi' | 'raporTuru', value: string) => {
    if (!user || !value) return;
    const ref = doc(db, `users/${user.uid}/suggestions`, 'userSuggestions');
    const listKey = type === 'ilgiliKisi' ? 'ilgiliKisiler' : 'raporTurleri';
    const list = suggestions[listKey] || [];
    const newList = list.filter(item => item !== value);
    await updateDoc(ref, { [listKey]: newList });
  };

  // Project operations
  const handleProjectFormSubmit = async () => {
    if (!projectFormData.name?.trim() || !user) {
      showToast('Proje adı zorunludur.', 'error');
      return;
    }

    const projectData: Partial<Project> = {
      name: projectFormData.name.trim(),
      description: projectFormData.description?.trim() || '',
      status: projectFormData.status || 'active',
      deadline: projectFormData.deadline?.trim() || undefined,
      updatedAt: serverTimestamp()
    };

    try {
      if (projectFormData.editing && projectFormData.id) {
        await updateDoc(doc(db, `users/${user.uid}/projects`, projectFormData.id), projectData);
        showToast('Proje güncellendi.', 'success');
      } else {
        projectData.createdAt = serverTimestamp();
        await addDoc(collection(db, `users/${user.uid}/projects`), projectData);
        showToast('Proje eklendi.', 'success');
      }

      setShowProjectModal(false);
      setProjectFormData({});
    } catch (error) {
      console.error("Proje kaydetme hatası:", error);
      showToast('Proje kaydedilirken bir hata oluştu.', 'error');
    }
  };

  // Task operations
  const handleTaskFormSubmit = async () => {
    if (!taskFormData.ilgiliKisi || !taskFormData.raporTuru || !user) {
      showToast('Lütfen ilgili kişi ve rapor türü alanlarını doldurun.', 'error');
      return;
    }

    const displayDate = taskFormData.displayDate?.trim() || null;
    const identifierStr = taskFormData.taskNumber ? taskFormData.taskNumber.toString() : '';
    const taskYear = displayDate ? (displayDate.split('.')[2] || new Date().getFullYear()) : new Date().getFullYear();
    
    let taskData: Partial<Task> = {
      displayDate: displayDate || undefined,
      ilgiliKisi: standardizeName(taskFormData.ilgiliKisi),
      raporTuru: standardizeName(taskFormData.raporTuru),
      not: taskFormData.not?.trim(),
      deadline: taskFormData.deadline?.trim() || undefined,
      updatedAt: serverTimestamp(),
    };

    if (identifierStr) {
      taskData = { 
        ...taskData, 
        hasManualIdentifier: true, 
        fullTaskIdentifier: `${taskYear}/${identifierStr}`, 
        taskNumber: parseInt(identifierStr),
        taskYear: parseInt(taskYear.toString())
      };
    } else {
      const autoId = Date.now();
      taskData = { 
        ...taskData, 
        hasManualIdentifier: false, 
        fullTaskIdentifier: `${taskYear}/OTOMATIK-${autoId}`, 
        taskNumber: undefined,
        taskYear: parseInt(taskYear.toString())
      };
    }

    try {
      if (taskFormData.editing && taskFormData.id) {
        await updateDoc(doc(db, `users/${user.uid}/tasks`, taskFormData.id), taskData);
        showToast('İş güncellendi.', 'success');
      } else {
        taskData.status = 'active';
        taskData.createdAt = serverTimestamp();
        await addDoc(collection(db, `users/${user.uid}/tasks`), taskData);
        showToast('İş eklendi.', 'success');
      }
      
      // Add suggestions
      await addSuggestion('ilgiliKisi', taskData.ilgiliKisi!);
      await addSuggestion('raporTuru', taskData.raporTuru!);
      
      setShowTaskModal(false);
      setTaskFormData({});
    } catch (error) {
      console.error("İş kaydetme hatası:", error);
      showToast('İş kaydedilirken bir hata oluştu.', 'error');
    }
  };

  const updateTaskStatus = async (taskId: string, status: 'active' | 'completed', successMessage: string) => {
    const ref = doc(db, `users/${user!.uid}/tasks`, taskId);
    const updateData: any = { status, updatedAt: serverTimestamp() };
    if (status === 'completed') updateData.completedAt = serverTimestamp();
    
    try {
      await updateDoc(ref, updateData);
      showToast(successMessage, 'success');
    } catch (error) { 
      showToast('İş durumu güncellenirken bir hata oluştu.', 'error'); 
    }
  };

  const deleteTask = async (taskId: string) => {
    const ref = doc(db, `users/${user!.uid}/tasks`, taskId);
    try {
      await deleteDoc(ref);
      showToast('İş kalıcı olarak silindi.', 'success');
    } catch (error) { 
      showToast('İş silinirken bir hata oluştu.', 'error'); 
    }
  };

  // Filter functions
  const getFilteredTasks = (tasks: Task[], filters: any) => {
    return tasks.filter(task => {
      const searchText = filters.text.toLowerCase();
      const searchMatch = (
        (task.ilgiliKisi || '').toLowerCase().includes(searchText) ||
        (task.raporTuru || '').toLowerCase().includes(searchText) ||
        (task.fullTaskIdentifier || '').toLowerCase().includes(searchText) ||
        (task.not || '').toLowerCase().includes(searchText)
      );
      const personMatch = !filters.person || (task.ilgiliKisi || '').toLowerCase() === filters.person.toLowerCase();
      const typeMatch = !filters.type || (task.raporTuru || '').toLowerCase() === filters.type.toLowerCase();
      const statusMatch = filters.status === 'all' || 
        (filters.status === 'assigned' ? task.hasManualIdentifier : !task.hasManualIdentifier);

      return searchMatch && personMatch && typeMatch && statusMatch;
    });
  };

  // Stats calculation
  const getStats = () => {
    const assignedCount = activeTasks.filter(t => t.hasManualIdentifier).length;
    const unassignedCount = activeTasks.filter(t => !t.hasManualIdentifier).length;
    const totalActive = activeTasks.length;

    const getCompletedCountInPeriod = (period: string) => {
      if (period === 'all') return archivedTasks.length;
      const periodMap = { '1m': 1, '3m': 3, '6m': 6 };
      const months = periodMap[period as keyof typeof periodMap];
      const now = new Date();
      const startDate = new Date(new Date().setMonth(now.getMonth() - months));
      return archivedTasks.filter(task => {
        return task.completedAt && task.completedAt.toDate() > startDate;
      }).length;
    };

    const completedCount = getCompletedCountInPeriod(dashboardPeriod);

    return { assignedCount, unassignedCount, totalActive, completedCount };
  };

  const stats = getStats();
  const filteredActiveTasks = getFilteredTasks(activeTasks, taskFilters);
  const filteredArchivedTasks = getFilteredTasks(archivedTasks, archiveFilters);

  const menuItems = [
    { id: 'dashboard', name: 'Panel', icon: 'fa-chart-pie' },
    { id: 'tasks', name: 'İşler', icon: 'fa-tasks' },
    { id: 'projects', name: 'Projeler', icon: 'fa-folder' },
    { id: 'timetracking', name: 'Zaman Takibi', icon: 'fa-stopwatch' },
    { id: 'calendar', name: 'Takvim', icon: 'fa-calendar-alt' },
    { id: 'archive', name: 'Arşiv', icon: 'fa-archive' },
    { id: 'settings', name: 'Ayarlar', icon: 'fa-cog' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="background-container fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="aurora-bg absolute w-[150%] h-[150%] bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20 animate-aurora"></div>
      </div>

      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900/50 backdrop-blur-lg border-r border-white/10 flex flex-col">
          <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
            <div className="text-xl font-bold text-white flex items-center gap-3">
              <i className="fa-solid fa-briefcase text-emerald-400"></i>
              <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                İş Portalı
              </span>
            </div>
          </div>
          
          <nav className="flex-grow px-4 py-6 space-y-2">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as typeof currentView)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all duration-200 ${
                  currentView === item.id
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white hover:translate-x-1'
                }`}
              >
                <i className={`fa-solid ${item.icon} fa-fw`}></i>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
          
          <div className="p-4 border-t border-white/10">
            <div className="text-sm">
              <p className="font-semibold text-white truncate">{user?.email}</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-8 border-b border-white/10">
            <h1 className="text-2xl font-bold text-white">
              {menuItems.find(item => item.id === currentView)?.name}
            </h1>
            
            <div className="flex items-center gap-4">
              {(currentView === 'tasks' || currentView === 'dashboard') && (
                <button
                  onClick={() => {
                    setTaskFormData({ editing: false });
                    setShowTaskModal(true);
                  }}
                  className="primary-btn flex items-center gap-2"
                >
                  <i className="fa-solid fa-plus"></i>
                  Yeni İş Ekle
                </button>
              )}
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {/* Dashboard View */}
            {currentView === 'dashboard' && (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="glass-card p-6 flex items-center gap-5">
                    <div className="bg-emerald-500/10 text-emerald-400 rounded-full h-16 w-16 flex items-center justify-center border border-emerald-500/20">
                      <i className="fa-solid fa-list-check text-2xl"></i>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm font-medium">Toplam Aktif İş</p>
                      <p className="text-3xl font-bold text-white">{stats.totalActive}</p>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6 flex items-center gap-5">
                    <div className="bg-blue-500/10 text-blue-400 rounded-full h-16 w-16 flex items-center justify-center border border-blue-500/20">
                      <i className="fa-solid fa-hashtag text-2xl"></i>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm font-medium">Sayı Atanmış</p>
                      <p className="text-3xl font-bold text-white">{stats.assignedCount}</p>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6 flex items-center gap-5">
                    <div className="bg-yellow-500/10 text-yellow-400 rounded-full h-16 w-16 flex items-center justify-center border border-yellow-500/20">
                      <i className="fa-solid fa-clock text-2xl"></i>
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm font-medium">Sayı Atanmamış</p>
                      <p className="text-3xl font-bold text-white">{stats.unassignedCount}</p>
                    </div>
                  </div>
                  
                  <div className="glass-card p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-5">
                        <div className="bg-purple-500/10 text-purple-400 rounded-full h-16 w-16 flex items-center justify-center border border-purple-500/20">
                          <i className="fa-solid fa-calendar-check text-2xl"></i>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm font-medium">Bitirilen İşler</p>
                          <p className="text-3xl font-bold text-white">{stats.completedCount}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-4 text-right">
                      Seçili Dönem: <span className="font-semibold text-gray-400">
                        {{'1m': 'Son 1 Ay', '3m': 'Son 3 Ay', '6m': 'Son 6 Ay', 'all': 'Tüm Zamanlar'}[dashboardPeriod]}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tasks View */}
            {currentView === 'tasks' && (
              <div className="glass-card p-6">
                <div className="md:flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white mb-4 md:mb-0">Aktif İşleri Filtrele</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['all', 'assigned', 'unassigned'].map(status => (
                      <button
                        key={status}
                        onClick={() => setTaskFilters({...taskFilters, status})}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          taskFilters.status === status
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/70 hover:text-gray-200'
                        }`}
                      >
                        {status === 'all' ? 'Tümü' : status === 'assigned' ? 'Sayı Atanmış' : 'Sayı Atanmamış'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <input 
                    type="text" 
                    placeholder="Genel arama yap..." 
                    value={taskFilters.text}
                    onChange={(e) => setTaskFilters({...taskFilters, text: e.target.value})}
                    className="form-input !py-2 text-sm"
                  />
                  <input 
                    type="text" 
                    placeholder="Kişiye göre filtrele..." 
                    value={taskFilters.person}
                    onChange={(e) => setTaskFilters({...taskFilters, person: e.target.value})}
                    list="personListFilter" 
                    className="form-input !py-2 text-sm"
                  />
                  <input 
                    type="text" 
                    placeholder="Türe göre filtrele..." 
                    value={taskFilters.type}
                    onChange={(e) => setTaskFilters({...taskFilters, type: e.target.value})}
                    list="reportTypeListFilter" 
                    className="form-input !py-2 text-sm"
                  />
                  <datalist id="personListFilter">
                    {suggestions.ilgiliKisiler.map(person => (
                      <option key={person} value={person}></option>
                    ))}
                  </datalist>
                  <datalist id="reportTypeListFilter">
                    {suggestions.raporTurleri.map(type => (
                      <option key={type} value={type}></option>
                    ))}
                  </datalist>
                </div>
                <div className="space-y-4">
                  {filteredActiveTasks.length > 0 ? filteredActiveTasks.map(task => (
                    <div key={task.id} className="bg-black/20 border border-white/10 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 transition-all duration-300 hover:border-emerald-500/50">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`flex-shrink-0 inline-block px-2.5 py-0.5 text-sm font-semibold rounded-full ${
                            task.hasManualIdentifier 
                              ? 'text-emerald-300 bg-emerald-500/20' 
                              : 'text-yellow-300 bg-yellow-500/20'
                          }`}>
                            {task.hasManualIdentifier ? task.fullTaskIdentifier : (task.taskYear || new Date().getFullYear()) + '/'}
                          </span>
                          <h3 className="font-bold text-base text-gray-200 truncate" title={task.raporTuru}>
                            {task.raporTuru || 'Tür Yok'}
                          </h3>
                        </div>
                        <div className="text-sm space-y-1.5 text-gray-400 pl-4 border-l-2 border-gray-700">
                          <p><strong className="font-medium text-gray-300">
                            <i className="fas fa-calendar-alt fa-fw mr-1.5 text-gray-500"></i>Kayıt Tarihi:</strong> {task.displayDate || formatDate(task.createdAt)}
                          </p>
                          <p><strong className="font-medium text-gray-300">
                            <i className="fas fa-user fa-fw mr-1.5 text-gray-500"></i>İlgili Kişi:</strong> {task.ilgiliKisi || 'Kişi Yok'}
                          </p>
                          {task.deadline && (
                            <p><strong className="font-medium text-gray-300">
                              <i className="fas fa-flag-checkered fa-fw mr-1.5 text-gray-500"></i>Bitiş Tarihi:</strong> {new Date(task.deadline + 'T00:00:00').toLocaleDateString('tr-TR')}
                            </p>
                          )}
                        </div>
                        {task.not && (
                          <div className="mt-3 text-xs text-gray-400 bg-gray-800/50 p-2 rounded-md border border-gray-700 whitespace-pre-wrap">
                            <i className="fas fa-sticky-note fa-fw mr-1.5 text-gray-500"></i>{task.not}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex gap-2 self-end sm:self-start">
                        <button 
                          onClick={() => {
                            setTaskFormData({...task, editing: true});
                            setShowTaskModal(true);
                          }}
                          className="text-gray-400 hover:bg-white/10 w-9 h-9 flex items-center justify-center rounded-md" 
                          title="Düzenle"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmMessage(`'${task.fullTaskIdentifier || task.raporTuru}' işini tamamlayıp arşivlemek istediğinizden emin misiniz?`);
                            setConfirmAction(() => () => updateTaskStatus(task.id, 'completed', 'İş arşivlendi.'));
                            setShowConfirmModal(true);
                          }}
                          className="text-emerald-400 hover:bg-emerald-500/20 w-9 h-9 flex items-center justify-center rounded-md" 
                          title="Tamamla (Arşivle)"
                        >
                          <i className="fas fa-check-circle"></i>
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmMessage(`'${task.fullTaskIdentifier || task.raporTuru}' işini KALICI olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`);
                            setConfirmAction(() => () => deleteTask(task.id));
                            setShowConfirmModal(true);
                          }}
                          className="text-red-400 hover:bg-red-500/20 w-9 h-9 flex items-center justify-center rounded-md" 
                          title="Kalıcı Olarak Sil"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-16 text-gray-500">
                      <i className="fas fa-folder-open text-5xl mb-4 text-gray-600"></i>
                      <p>Aktif iş bulunamadı.</p>
                      <button 
                        onClick={() => {
                          setTaskFormData({ editing: false });
                          setShowTaskModal(true);
                        }} 
                        className="primary-btn mt-6"
                      >
                        Yeni İş Ekle
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Archive View */}
            {currentView === 'archive' && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-white mb-4">Arşivde Filtrele</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <input 
                    type="text" 
                    placeholder="Arama yap..." 
                    value={archiveFilters.text}
                    onChange={(e) => setArchiveFilters({...archiveFilters, text: e.target.value})}
                    className="form-input !py-2 text-sm"
                  />
                  <input 
                    type="text" 
                    placeholder="Kişiye göre filtrele..." 
                    value={archiveFilters.person}
                    onChange={(e) => setArchiveFilters({...archiveFilters, person: e.target.value})}
                    list="personListFilter" 
                    className="form-input !py-2 text-sm"
                  />
                  <input 
                    type="text" 
                    placeholder="Türe göre filtrele..." 
                    value={archiveFilters.type}
                    onChange={(e) => setArchiveFilters({...archiveFilters, type: e.target.value})}
                    list="reportTypeListFilter" 
                    className="form-input !py-2 text-sm"
                  />
                </div>
                <div className="space-y-4">
                  {filteredArchivedTasks.length > 0 ? filteredArchivedTasks.map(task => (
                    <div key={task.id} className="bg-black/20 border border-white/10 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 transition-all duration-300 hover:border-emerald-500/50">
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className={`flex-shrink-0 inline-block px-2.5 py-0.5 text-sm font-semibold rounded-full ${
                            task.hasManualIdentifier 
                              ? 'text-emerald-300 bg-emerald-500/20' 
                              : 'text-yellow-300 bg-yellow-500/20'
                          }`}>
                            {task.hasManualIdentifier ? task.fullTaskIdentifier : (task.taskYear || new Date().getFullYear()) + '/'}
                          </span>
                          <h3 className="font-bold text-base text-gray-200 truncate" title={task.raporTuru}>
                            {task.raporTuru || 'Tür Yok'}
                          </h3>
                        </div>
                        <div className="text-sm space-y-1.5 text-gray-400 pl-4 border-l-2 border-gray-700">
                          <p><strong className="font-medium text-gray-300">
                            <i className="fas fa-calendar-alt fa-fw mr-1.5 text-gray-500"></i>Kayıt Tarihi:</strong> {task.displayDate || formatDate(task.createdAt)}
                          </p>
                          <p><strong className="font-medium text-gray-300">
                            <i className="fas fa-user fa-fw mr-1.5 text-gray-500"></i>İlgili Kişi:</strong> {task.ilgiliKisi || 'Kişi Yok'}
                          </p>
                          <p><strong className="font-medium text-gray-300">
                            <i className="fas fa-check-circle fa-fw mr-1.5 text-gray-500"></i>Tamamlanma:</strong> {formatDate(task.completedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex gap-2 self-end sm:self-start">
                        <button 
                          onClick={() => updateTaskStatus(task.id, 'active', 'İş aktif listesine taşındı.')}
                          className="text-blue-400 hover:bg-blue-500/20 w-9 h-9 flex items-center justify-center rounded-md" 
                          title="Aktif İşlere Geri Al"
                        >
                          <i className="fas fa-undo"></i>
                        </button>
                        <button 
                          onClick={() => {
                            setConfirmMessage(`'${task.fullTaskIdentifier || task.raporTuru}' işini KALICI olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`);
                            setConfirmAction(() => () => deleteTask(task.id));
                            setShowConfirmModal(true);
                          }}
                          className="text-red-400 hover:bg-red-500/20 w-9 h-9 flex items-center justify-center rounded-md" 
                          title="Kalıcı Olarak Sil"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-16 text-gray-500">
                      <i className="fas fa-archive text-5xl mb-4 text-gray-600"></i>
                      <p>Arşivde iş bulunamadı.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Projects View */}
            {currentView === 'projects' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-white">Projeler</h2>
                  <button
                    onClick={() => {
                      setProjectFormData({ editing: false });
                      setShowProjectModal(true);
                    }}
                    className="primary-btn flex items-center gap-2"
                  >
                    <i className="fa-solid fa-plus"></i>
                    Yeni Proje Ekle
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.length > 0 ? projects.map(project => (
                    <div key={project.id} className="glass-card p-6 hover:border-emerald-500/50 transition-all duration-300">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-2">{project.name}</h3>
                          <p className="text-gray-400 text-sm">{project.description}</p>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <button
                            onClick={() => {
                              setProjectFormData({...project, editing: true});
                              setShowProjectModal(true);
                            }}
                            className="text-gray-400 hover:text-white p-2 rounded transition-colors"
                            title="Düzenle"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                          project.status === 'active' ? 'text-emerald-300 bg-emerald-500/20' :
                          project.status === 'completed' ? 'text-blue-300 bg-blue-500/20' :
                          'text-yellow-300 bg-yellow-500/20'
                        }`}>
                          {project.status === 'active' ? 'Aktif' : project.status === 'completed' ? 'Tamamlandı' : 'Beklemede'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(project.createdAt)}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full text-center py-16 text-gray-500">
                      <i className="fas fa-folder text-5xl mb-4 text-gray-600"></i>
                      <p>Proje bulunamadı.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Time Tracking View */}
            {currentView === 'timetracking' && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white">Zaman Takibi</h2>
                
                {/* Active Timer */}
                {activeTimer && (
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-emerald-400">Aktif Zamanlayıcı</h3>
                        <p className="text-gray-400">
                          {activeTasks.find(t => t.id === activeTimer.taskId)?.raporTuru || 'Bilinmeyen İş'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">
                          {Math.floor(activeTimer.currentTime / 3600).toString().padStart(2, '0')}:
                          {Math.floor((activeTimer.currentTime % 3600) / 60).toString().padStart(2, '0')}:
                          {(activeTimer.currentTime % 60).toString().padStart(2, '0')}
                        </div>
                        <button
                          onClick={() => {
                            clearInterval(activeTimer.intervalId);
                            setActiveTimer(null);
                          }}
                          className="mt-2 bg-red-500/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                          Durdur
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task Time Tracking */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">İşler için Zaman Takibi</h3>
                  <div className="space-y-3">
                    {activeTasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div>
                          <h4 className="font-semibold text-white">{task.raporTuru}</h4>
                          <p className="text-sm text-gray-400">{task.ilgiliKisi}</p>
                          <p className="text-xs text-gray-500">
                            Toplam Süre: {Math.floor((task.timeTrackedInSeconds || 0) / 3600)}s {Math.floor(((task.timeTrackedInSeconds || 0) % 3600) / 60)}d
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const intervalId = setInterval(() => {
                              setActiveTimer(prev => prev ? {...prev, currentTime: prev.currentTime + 1} : null);
                            }, 1000);
                            setActiveTimer({
                              taskId: task.id,
                              currentTime: 0,
                              intervalId
                            });
                          }}
                          disabled={activeTimer?.taskId === task.id}
                          className="primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {activeTimer?.taskId === task.id ? 'Aktif' : 'Başlat'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Calendar View */}
            {currentView === 'calendar' && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white">Takvim Görünümü</h2>
                
                {/* Calendar Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-emerald-400 mb-2">Bu Ay</h3>
                    <div className="text-2xl font-bold text-white">
                      {archivedTasks.filter(task => {
                        const taskDate = task.completedAt?.toDate();
                        const now = new Date();
                        return taskDate && taskDate.getMonth() === now.getMonth() && taskDate.getFullYear() === now.getFullYear();
                      }).length}
                    </div>
                    <p className="text-sm text-gray-400">Tamamlanan İş</p>
                  </div>
                  
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-blue-400 mb-2">Bu Hafta</h3>
                    <div className="text-2xl font-bold text-white">
                      {archivedTasks.filter(task => {
                        const taskDate = task.completedAt?.toDate();
                        const now = new Date();
                        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
                        return taskDate && taskDate >= weekStart;
                      }).length}
                    </div>
                    <p className="text-sm text-gray-400">Tamamlanan İş</p>
                  </div>
                  
                  <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold text-yellow-400 mb-2">Yaklaşan Teslim</h3>
                    <div className="text-2xl font-bold text-white">
                      {activeTasks.filter(task => {
                        if (!task.deadline) return false;
                        const deadline = new Date(task.deadline);
                        const now = new Date();
                        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return daysUntil <= 7 && daysUntil >= 0;
                      }).length}
                    </div>
                    <p className="text-sm text-gray-400">7 Gün İçinde</p>
                  </div>
                </div>

                {/* Upcoming Deadlines */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Yaklaşan Teslim Tarihleri</h3>
                  <div className="space-y-3">
                    {activeTasks
                      .filter(task => task.deadline)
                      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
                      .slice(0, 10)
                      .map(task => {
                        const deadline = new Date(task.deadline!);
                        const now = new Date();
                        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        
                        return (
                          <div key={task.id} className={`p-3 rounded-lg border ${
                            daysUntil <= 0 ? 'bg-red-500/20 border-red-500/30' :
                            daysUntil <= 3 ? 'bg-yellow-500/20 border-yellow-500/30' :
                            'bg-gray-800/50 border-gray-600'
                          }`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-semibold text-white">{task.raporTuru}</h4>
                                <p className="text-sm text-gray-400">{task.ilgiliKisi}</p>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-white">
                                  {deadline.toLocaleDateString('tr-TR')}
                                </div>
                                <div className={`text-sm ${
                                  daysUntil <= 0 ? 'text-red-400' :
                                  daysUntil <= 3 ? 'text-yellow-400' :
                                  'text-gray-400'
                                }`}>
                                  {daysUntil <= 0 ? 'Gecikti' : `${daysUntil} gün kaldı`}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Settings View */}
            {currentView === 'settings' && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-white">Ayarlar</h2>
                
                {/* Dashboard Settings */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Panel Ayarları</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Tamamlanan İş Gösterim Periyodu
                      </label>
                      <select
                        value={dashboardPeriod}
                        onChange={(e) => setDashboardPeriod(e.target.value as typeof dashboardPeriod)}
                        className="form-input"
                      >
                        <option value="1m">Son 1 Ay</option>
                        <option value="3m">Son 3 Ay</option>
                        <option value="6m">Son 6 Ay</option>
                        <option value="all">Tüm Zamanlar</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Data Management */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Veri Yönetimi</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-emerald-400 mb-2">İstatistikler</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                        <div>Toplam Aktif İş: <span className="text-white font-semibold">{activeTasks.length}</span></div>
                        <div>Toplam Arşiv: <span className="text-white font-semibold">{archivedTasks.length}</span></div>
                        <div>Toplam Proje: <span className="text-white font-semibold">{projects.length}</span></div>
                        <div>Kayıtlı Kişi: <span className="text-white font-semibold">{suggestions.ilgiliKisiler.length}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Suggestion Management */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Öneriler Yönetimi</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-blue-400 mb-2">Kayıtlı Kişiler ({suggestions.ilgiliKisiler.length})</h4>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.ilgiliKisiler.map(person => (
                          <span key={person} className="flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm">
                            {person}
                            <button
                              onClick={() => deleteSuggestion('ilgiliKisi', person)}
                              className="text-blue-400 hover:text-red-400 transition-colors"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-purple-400 mb-2">Kayıtlı Rapor Türleri ({suggestions.raporTurleri.length})</h4>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.raporTurleri.map(type => (
                          <span key={type} className="flex items-center gap-2 bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm">
                            {type}
                            <button
                              onClick={() => deleteSuggestion('raporTuru', type)}
                              className="text-purple-400 hover:text-red-400 transition-colors"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-lg p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-emerald-400">
                {taskFormData.editing ? 'İşi Düzenle' : 'Yeni İş Ekle'}
              </h3>
              <button 
                onClick={() => {
                  setShowTaskModal(false);
                  setTaskFormData({});
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400">Kayıt Tarihi (GG.AA.YYYY)</label>
                  <input
                    type="text"
                    value={taskFormData.displayDate || ''}
                    onChange={(e) => setTaskFormData({...taskFormData, displayDate: e.target.value})}
                    placeholder="Opsiyonel"
                    className="form-input mt-1 !py-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Sayı No</label>
                  <input
                    type="number"
                    value={taskFormData.taskNumber || ''}
                    onChange={(e) => setTaskFormData({...taskFormData, taskNumber: parseInt(e.target.value) || undefined})}
                    placeholder="Boş bırakılabilir"
                    className="form-input mt-1 !py-2"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Bitiş Tarihi (Opsiyonel)</label>
                <input
                  type="date"
                  value={taskFormData.deadline || ''}
                  onChange={(e) => setTaskFormData({...taskFormData, deadline: e.target.value})}
                  className="form-input mt-1 !py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">İlgili Kişi (Zorunlu)</label>
                <input
                  type="text"
                  value={taskFormData.ilgiliKisi || ''}
                  onChange={(e) => setTaskFormData({...taskFormData, ilgiliKisi: e.target.value})}
                  list="personListModal"
                  required
                  className="form-input mt-1 !py-2"
                />
                <datalist id="personListModal">
                  {suggestions.ilgiliKisiler.map(person => (
                    <option key={person} value={person}></option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Rapor/İş Türü (Zorunlu)</label>
                <input
                  type="text"
                  value={taskFormData.raporTuru || ''}
                  onChange={(e) => setTaskFormData({...taskFormData, raporTuru: e.target.value})}
                  list="reportTypeListModal"
                  required
                  className="form-input mt-1 !py-2"
                />
                <datalist id="reportTypeListModal">
                  {suggestions.raporTurleri.map(type => (
                    <option key={type} value={type}></option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Notlar</label>
                <textarea
                  value={taskFormData.not || ''}
                  onChange={(e) => setTaskFormData({...taskFormData, not: e.target.value})}
                  className="form-input mt-1 !py-2 min-h-[80px]"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTaskModal(false);
                  setTaskFormData({});
                }}
                className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition"
              >
                İptal
              </button>
              <button
                onClick={handleTaskFormSubmit}
                className="primary-btn !py-2"
              >
                {taskFormData.editing ? 'Değişiklikleri Kaydet' : 'İşi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-lg p-6">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xl font-semibold text-emerald-400">
                {projectFormData.editing ? 'Projeyi Düzenle' : 'Yeni Proje Ekle'}
              </h3>
              <button 
                onClick={() => {
                  setShowProjectModal(false);
                  setProjectFormData({});
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Proje Adı (Zorunlu)</label>
                <input
                  type="text"
                  value={projectFormData.name || ''}
                  onChange={(e) => setProjectFormData({...projectFormData, name: e.target.value})}
                  required
                  className="form-input mt-1 !py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Açıklama</label>
                <textarea
                  value={projectFormData.description || ''}
                  onChange={(e) => setProjectFormData({...projectFormData, description: e.target.value})}
                  className="form-input mt-1 !py-2 min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400">Durum</label>
                  <select
                    value={projectFormData.status || 'active'}
                    onChange={(e) => setProjectFormData({...projectFormData, status: e.target.value as Project['status']})}
                    className="form-input mt-1 !py-2"
                  >
                    <option value="active">Aktif</option>
                    <option value="paused">Beklemede</option>
                    <option value="completed">Tamamlandı</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400">Bitiş Tarihi (Opsiyonel)</label>
                  <input
                    type="date"
                    value={projectFormData.deadline || ''}
                    onChange={(e) => setProjectFormData({...projectFormData, deadline: e.target.value})}
                    className="form-input mt-1 !py-2"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowProjectModal(false);
                  setProjectFormData({});
                }}
                className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-4 py-2 rounded-lg transition"
              >
                İptal
              </button>
              <button
                onClick={handleProjectFormSubmit}
                className="primary-btn !py-2"
              >
                {projectFormData.editing ? 'Değişiklikleri Kaydet' : 'Projeyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card w-full max-w-md flex flex-col">
            <div className="p-6 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500/10 mb-4 border border-yellow-500/20">
                <i className="fa-solid fa-exclamation-triangle text-2xl text-yellow-400"></i>
              </div>
              <h2 className="text-lg font-semibold text-white">Emin misiniz?</h2>
              <p className="my-3 text-gray-300">{confirmMessage}</p>
            </div>
            <div className="p-5 border-t border-white/10 bg-black/20 rounded-b-2xl flex justify-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="bg-gray-500/50 hover:bg-gray-500/70 text-white font-semibold px-6 py-2 rounded-lg transition"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  confirmAction();
                  setShowConfirmModal(false);
                }}
                className="primary-btn !bg-yellow-500 hover:!bg-yellow-600"
              >
                Evet, Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        .primary-btn {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          transition: all 0.3s ease;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .primary-btn:hover {
          background: linear-gradient(135deg, #059669, #047857);
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
        }
        .glass-card {
          background: rgba(17, 24, 39, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 1.5rem;
        }
        .form-input {
          background-color: rgba(31, 41, 55, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e5e7eb;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          transition: all 0.3s ease;
          width: 100%;
        }
        .form-input::placeholder {
          color: #9ca3af;
        }
        .form-input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
        }
        .aurora-bg {
          animation: moveAurora 25s alternate infinite ease-in-out;
        }
        @keyframes moveAurora {
          0% { transform: translate(-20%, -20%) rotate(0deg); }
          100% { transform: translate(20%, 20%) rotate(180deg); }
        }
        `}
      </style>
    </div>
  );
};

export default Isler;