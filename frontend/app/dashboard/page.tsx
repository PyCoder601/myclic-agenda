'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar as CalendarIcon, LogOut, Plus, CheckCircle2, Clock, TrendingUp, User } from 'lucide-react';
import Calendar from '@/components/Calendar';
import TaskModal from '@/components/TaskModal';
import api from '@/lib/api';
import { Task, ViewMode } from '@/lib/types';

export default function DashboardPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<Date>();
  const [modalInitialHour, setModalInitialHour] = useState<number>();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  const fetchTasks = async () => {
    try {
      const response = await api.get('/tasks/');
      setTasks(response.data);
    } catch (error) {
      console.error('Erreur lors de la récupération des tâches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTask = async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedTask) {
        await api.put(`/tasks/${selectedTask.id}/`, taskData);
      } else {
        await api.post('/tasks/', taskData);
      }
      await fetchTasks();
      setIsModalOpen(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la tâche:', error);
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await api.delete(`/tasks/${id}/`);
      await fetchTasks();
    } catch (error) {
      console.error('Erreur lors de la suppression de la tâche:', error);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setModalInitialDate(undefined);
    setModalInitialHour(undefined);
    setIsModalOpen(true);
  };

  const handleAddTask = (date: Date, hour?: number) => {
    setSelectedTask(null);
    setModalInitialDate(date);
    setModalInitialHour(hour);
    setIsModalOpen(true);
  };

  const getStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.is_completed).length;
    const upcoming = tasks.filter(t => {
      const now = new Date();
      const start = new Date(t.start_date);
      return start > now && !t.is_completed;
    }).length;

    return { total, completed, upcoming };
  };

  const getUpcomingTasks = () => {
    const now = new Date();
    return tasks
      .filter(t => new Date(t.start_date) > now && !t.is_completed)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, 5);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <CalendarIcon className="w-16 h-16 text-[#005f82] mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-semibold text-gray-800">Chargement...</h1>
        </div>
      </div>
    );
  }

  const stats = getStats();
  const upcomingTasks = getUpcomingTasks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-[#005f82] to-[#007ba8] p-3 rounded-xl shadow-lg">
                <CalendarIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent">
                  Mon Agenda
                </h1>
                <p className="text-sm text-slate-600">Bonjour, {user?.first_name || user?.username} 👋</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-[#005f82] to-[#007ba8] hover:shadow-lg text-white px-5 py-2.5 rounded-xl transition-all font-medium shadow-md hover:scale-105 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                Nouvelle tâche
              </button>
              <div className="h-8 w-px bg-slate-300"></div>
              <button
                onClick={logout}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl transition-all border border-slate-200 hover:border-slate-300"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-8 py-6">
        <div className="flex gap-6 h-[calc(100vh-140px)]">
          {/* Main Calendar */}
          <div className="flex-1 flex flex-col">
            {/* View Mode Selector */}
            <div className="mb-5 flex gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 w-fit">
              <button
                onClick={() => setViewMode('day')}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                  viewMode === 'day'
                    ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Aujourd&apos;hui
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                  viewMode === 'week'
                    ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Cette semaine
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                  viewMode === 'month'
                    ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Ce mois
              </button>
            </div>

            {/* Calendar */}
            <div className="flex-1">
              <Calendar
                tasks={tasks}
                viewMode={viewMode}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onTaskClick={handleTaskClick}
                onAddTask={handleAddTask}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-96 flex flex-col gap-5">
            {/* User Info Card */}
            <div className="bg-gradient-to-br from-[#005f82] to-[#007ba8] rounded-2xl p-6 shadow-lg text-white">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{user?.first_name || user?.username}</h3>
                  <p className="text-sm text-blue-100">{user?.email}</p>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 mt-4">
                <p className="text-sm text-blue-100">Productivité</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
                  <span className="text-sm text-blue-100">de tâches complétées</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#005f82]" />
                Statistiques
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500 p-2.5 rounded-lg">
                      <CalendarIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">Total</div>
                      <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500 p-2.5 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">Terminées</div>
                      <div className="text-2xl font-bold text-slate-800">{stats.completed}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-500 p-2.5 rounded-lg">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-600 font-medium">À venir</div>
                      <div className="text-2xl font-bold text-slate-800">{stats.upcoming}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming Tasks */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 flex-1 overflow-hidden flex flex-col">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Prochaines tâches</h2>
              <div className="space-y-3 overflow-y-auto flex-1">
                {upcomingTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Aucune tâche à venir</p>
                  </div>
                ) : (
                  upcomingTasks.map(task => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="group p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 hover:border-[#005f82] cursor-pointer transition-all hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-[#005f82] w-1.5 h-1.5 rounded-full mt-2 group-hover:scale-150 transition-transform"></div>
                        <div className="flex-1">
                          <h3 className="font-medium text-slate-800 mb-1 group-hover:text-[#005f82] transition-colors">{task.title}</h3>
                          <p className="text-xs text-slate-500">
                            {new Date(task.start_date).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
          setModalInitialDate(undefined);
          setModalInitialHour(undefined);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        task={selectedTask}
        initialDate={modalInitialDate}
        initialHour={modalInitialHour}
      />
    </div>
  );
}

