'use client';

import { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addDays, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Task, ViewMode } from '@/lib/types';

interface CalendarProps {
  tasks: Task[];
  viewMode: ViewMode;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, hour?: number) => void;
}

export default function Calendar({ tasks, viewMode, currentDate, onDateChange, onTaskClick, onAddTask }: CalendarProps) {
  const [hours] = useState(Array.from({ length: 24 }, (_, i) => i));
  const currentHourRef = useRef<HTMLDivElement>(null);
  const dayViewRef = useRef<HTMLDivElement>(null);

  // Scroll vers l'heure actuelle dans la vue jour et semaine
  useEffect(() => {
    if ((viewMode === 'day' || viewMode === 'week') && currentHourRef.current && dayViewRef.current) {
      setTimeout(() => {
        if (currentHourRef.current && dayViewRef.current) {
          const containerHeight = dayViewRef.current.clientHeight;
          const hourPosition = currentHourRef.current.offsetTop;
          dayViewRef.current.scrollTop = hourPosition - (containerHeight / 3);
        }
      }, 100);
    }
  }, [viewMode, currentDate]);

  const getTasksForDate = (date: Date, hour?: number) => {
    return tasks.filter(task => {
      const taskStart = new Date(task.start_date);
      const taskEnd = new Date(task.end_date);
      
      if (hour !== undefined) {
        const hourStart = new Date(date);
        hourStart.setHours(hour, 0, 0, 0);
        const hourEnd = new Date(date);
        hourEnd.setHours(hour, 59, 59, 999);
        
        return taskStart <= hourEnd && taskEnd >= hourStart;
      }
      
      return taskStart <= endOfDay(date) && taskEnd >= startOfDay(date);
    });
  };

  const isTaskSpanning = (task: Task, date: Date) => {
    const taskStart = new Date(task.start_date);
    const taskEnd = new Date(task.end_date);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    return taskStart < dayStart && taskEnd > dayEnd;
  };

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    onDateChange(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onDateChange(newDate);
  };

  const getDateRange = () => {
    if (viewMode === 'day') {
      return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'd MMM', { locale: fr })} - ${format(end, 'd MMM yyyy', { locale: fr })}`;
    } else {
      return format(currentDate, 'MMMM yyyy', { locale: fr });
    }
  };

  const renderDayView = () => {
    const currentHour = new Date().getHours();
    const isToday = isSameDay(currentDate, new Date());

    return (
      <div ref={dayViewRef} className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/30 to-blue-50/20">
        <div className="min-h-full">
          {hours.map(hour => {
            const hourTasks = getTasksForDate(currentDate, hour);
            const isCurrentHour = isToday && hour === currentHour;
            
            return (
              <div 
                key={hour} 
                ref={isCurrentHour ? currentHourRef : null}
                className={`group flex border-b border-slate-200/50 transition-all duration-200 ${
                  isCurrentHour ? 'bg-blue-50/70 shadow-inner' : 'hover:bg-blue-50/30'
                }`}
                style={{ minHeight: '50px' }}
              >
                <div className={`w-16 flex-shrink-0 bg-gradient-to-r from-slate-50 to-blue-50/50 px-2 py-1 text-xs font-semibold border-r border-slate-200/50 transition-all duration-200 ${
                  isCurrentHour ? 'text-[#005f82] font-bold' : 'text-slate-700 group-hover:text-[#005f82]'
                }`}>
                  {`${hour.toString().padStart(2, '0')}:00`}
                  {isCurrentHour && (
                    <div className="flex items-center justify-center mt-1">
                      <div className="w-1.5 h-1.5 bg-[#005f82] rounded-full animate-pulse-slow shadow-md"></div>
                    </div>
                  )}
                </div>
                <div 
                  className="flex-1 p-2 hover:bg-blue-50/40 cursor-pointer transition-all duration-200 relative"
                  onClick={() => onAddTask(currentDate, hour)}
                >
                  {hourTasks.map(task => {
                    const taskColor = task.calendar_source_color || '#005f82';
                    return (
                      <div
                        key={task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                        className="group/task mb-2 p-2.5 rounded-xl hover:shadow-xl cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
                        style={{
                          background: `linear-gradient(135deg, ${taskColor} 0%, ${taskColor}dd 100%)`,
                          borderLeft: `4px solid ${taskColor}`,
                          boxShadow: `0 2px 8px ${taskColor}30`
                        }}
                      >
                        <div className="font-semibold text-white text-xs group-hover/task:text-shadow">{task.title}</div>
                        {task.description && (
                          <div className="text-[10px] text-white/90 mt-1 line-clamp-1">{task.description}</div>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="text-[10px] text-white/80 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {format(new Date(task.start_date), 'HH:mm')} - {format(new Date(task.end_date), 'HH:mm')}
                          </div>
                          {task.calendar_source_name && (
                            <div className="text-[9px] text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                              {task.calendar_source_name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const currentHour = new Date().getHours();
    const today = new Date();

    return (
      <div ref={dayViewRef} className="flex-1 overflow-auto bg-white">
        <div className="flex border-b border-slate-200 sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="w-16 flex-shrink-0 border-r border-slate-200"></div>
          {weekDays.map(day => (
            <div key={day.toString()} className="flex-1 min-w-[100px] p-2 text-center border-r border-slate-200">
              <div className={`font-semibold text-xs ${isSameDay(day, new Date()) ? 'text-[#005f82]' : 'text-slate-600'}`}>
                {format(day, 'EEE', { locale: fr })}
              </div>
              <div className={`text-lg font-bold mt-0.5 ${
                isSameDay(day, new Date()) 
                  ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white w-8 h-8 rounded-xl flex items-center justify-center mx-auto shadow-md text-sm' 
                  : 'text-slate-800'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        <div className="min-h-full">
          {hours.map(hour => {
            const isCurrentHour = hour === currentHour;
            
            return (
              <div 
                key={hour} 
                ref={isCurrentHour ? currentHourRef : null}
                className={`flex border-b border-slate-200 ${isCurrentHour ? 'bg-blue-50/30' : ''}`} 
                style={{ minHeight: '50px' }}
              >
                <div className={`w-16 flex-shrink-0 bg-gradient-to-r from-slate-50 to-blue-50 px-2 py-1 text-xs font-semibold border-r border-slate-200 ${
                  isCurrentHour ? 'text-[#005f82]' : 'text-slate-700'
                }`}>
                  {`${hour.toString().padStart(2, '0')}:00`}
                  {isCurrentHour && <div className="w-1 h-1 bg-[#005f82] rounded-full mx-auto mt-0.5"></div>}
                </div>
                {weekDays.map(day => {
                  const dayTasks = getTasksForDate(day, hour);
                  const isCurrentDayAndHour = isSameDay(day, today) && hour === currentHour;
                  
                  return (
                    <div
                      key={day.toString()}
                      className={`flex-1 min-w-[100px] p-1 border-r border-slate-200 hover:bg-blue-50/50 cursor-pointer transition-colors ${
                        isCurrentDayAndHour ? 'bg-blue-100/30' : ''
                      }`}
                      onClick={() => onAddTask(day, hour)}
                    >
                      {dayTasks.map(task => {
                        const taskColor = task.calendar_source_color || '#005f82';
                        return (
                          <div
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTaskClick(task);
                            }}
                            className="mb-0.5 p-1.5 rounded-lg hover:shadow-md cursor-pointer transition-all text-[10px]"
                            style={{
                              background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
                              borderLeft: `3px solid ${taskColor}`
                            }}
                          >
                            <div className="font-semibold text-white truncate">{task.title}</div>
                            <div className="text-white/80 font-medium mt-0.5">
                              {format(new Date(task.start_date), 'HH:mm')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    return (
      <div className="flex-1 flex flex-col bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50">
          {weekDays.map(day => (
            <div key={day} className="p-3 text-center font-semibold text-slate-700 border-r border-slate-200 last:border-r-0">
              {day}
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 auto-rows-fr">
          {calendarDays.map(day => {
            const dayTasks = getTasksForDate(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={day.toString()}
                className={`border-r border-b border-slate-200 p-2 min-h-[120px] hover:bg-blue-50/50 cursor-pointer transition-colors ${
                  !isCurrentMonth ? 'bg-slate-50/50' : ''
                }`}
                onClick={() => onAddTask(day)}
              >
                <div className={`text-sm font-semibold mb-2 ${
                  isToday 
                    ? 'bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white rounded-xl w-8 h-8 flex items-center justify-center shadow-md' 
                    : isCurrentMonth 
                      ? 'text-slate-800' 
                      : 'text-slate-400'
                }`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map(task => {
                    const isSpanning = isTaskSpanning(task, day);
                    const taskStart = new Date(task.start_date);
                    const taskEnd = new Date(task.end_date);
                    const isStart = isSameDay(taskStart, day);
                    const isEnd = isSameDay(taskEnd, day);
                    const taskColor = task.calendar_source_color || '#005f82';

                    return (
                      <div
                        key={task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                        className={`text-xs p-1.5 hover:shadow-md text-white cursor-pointer transition-all ${
                          isSpanning ? 'rounded-none' : 'rounded-lg'
                        } ${
                          isStart && !isEnd ? 'rounded-r-none' : ''
                        } ${
                          isEnd && !isStart ? 'rounded-l-none' : ''
                        }`}
                        style={{
                          background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
                          borderLeft: `3px solid ${taskColor}`
                        }}
                      >
                        <div className="font-semibold truncate">{task.title}</div>
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <div className="text-xs text-slate-500 pl-1 font-medium">
                      +{dayTasks.length - 3} autres
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden shadow-xl border border-slate-200/50 animate-fadeIn">
      {/* Calendar Header avec gradient et animations */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200/50 bg-gradient-to-r from-white via-blue-50/40 to-white backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={navigatePrevious}
            className="group p-2.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-300 text-slate-700 hover:shadow-lg border border-transparent hover:border-[#005f82]/20"
            title="Période précédente"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:-translate-x-1" />
          </button>

          <div className="text-center min-w-[280px]">
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent capitalize">
              {getDateRange()}
            </h2>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-gradient-to-r from-[#005f82] to-[#007ba8] rounded-full animate-pulse-slow shadow-sm"></span>
              <span className="font-medium">{tasks.length}</span>
              {tasks.length > 1 ? 'événements' : 'événement'}
            </p>
          </div>

          <button
            onClick={navigateNext}
            className="group p-2.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-xl transition-all duration-300 text-slate-700 hover:shadow-lg border border-transparent hover:border-[#005f82]/20"
            title="Période suivante"
          >
            <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {viewMode === 'day' && renderDayView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'month' && renderMonthView()}
    </div>
  );
}

