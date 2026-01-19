"use client";

import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, GripVertical } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
} from "@dnd-kit/core";
import { Task, ViewMode, CalendarSource } from "@/lib/types";
import { baikalAPI } from "@/lib/api";

// Helper pour parser les dates ISO locales sans conversion timezone
const parseLocalDate = (dateString: string | Date | undefined | null): Date => {
  // Si c'est déjà une Date, la retourner directement
  if (dateString instanceof Date) {
    return dateString;
  }

  // Si c'est null ou undefined, retourner la date actuelle (fallback sécurisé)
  if (!dateString) {
    console.warn('parseLocalDate: date vide ou null, utilisation de la date actuelle');
    return new Date();
  }

  // Convertir en string si ce n'est pas déjà le cas
  const dateStr = String(dateString);

  // Si la date contient déjà un Z ou un +/-, c'est une date UTC qu'il faut convertir
  if (dateStr.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }

  // Sinon, c'est une date locale au format "YYYY-MM-DDTHH:mm:ss"
  // On la parse manuellement pour éviter toute conversion timezone
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (parts) {
    const [, year, month, day, hour, minute, second] = parts;
    return new Date(
      parseInt(year),
      parseInt(month) - 1, // Les mois commencent à 0
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
  }

  // Fallback sur le parsing standard
  return new Date(dateStr);
};

// Helper pour ajouter des minutes à une date SANS conversion timezone
const addMinutesLocal = (date: Date, minutes: number): Date => {
  // Ne PAS utiliser getTime() + minutes * 60 * 1000 car ça peut causer des problèmes de timezone
  // À la place, manipuler directement les composants de la date
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes() + minutes,
    date.getSeconds()
  );
  return result;
};

interface CalendarProps {
  tasks: Task[];
  viewMode: ViewMode;
  mainViewMode: 'personal' | 'group';
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, hour?: number) => void;
  onTaskDrop: (taskId: string, newDate: Date) => void;
  onTaskResize?: (taskId: string, newEndDate: Date) => void;
  calendars: CalendarSource[];
  isNavigating?: boolean;
  pendingDate?: Date | null;
}

// Helper function to get calendar color for a task
const getTaskColor = (task: Task, calendars: CalendarSource[]): string => {
  if (task.calendar_source_color) return task.calendar_source_color;

  const calendarId = task.calendar_source_id;
  if (!calendarId) return "#005f82";

  const calendar = calendars.find(cal => (cal.calendarid || cal.id) === calendarId);
  if (calendar) {
    // Baikal calendar color or fallback
    return calendar.calendarcolor || "#005f82";
  }

  return "#005f82";
};

const DayTasksModal = memo(
  ({
    date,
    tasks,
    onClose,
    onTaskClick,
    calendars,
  }: {
    date: Date;
    tasks: Task[];
    onClose: () => void;
    onTaskClick: (task: Task) => void;
    calendars: CalendarSource[];
  }) => {
    if (!date) return null;

    return (
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100]"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl border border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50/50 rounded-t-2xl">
            <h2 className="text-lg font-bold text-slate-800 capitalize">
              {format(date, "EEEE d MMMM yyyy", { locale: fr })}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200/60 rounded-xl transition-all text-slate-500 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto p-4 space-y-3">
            {tasks.length > 0 ? (
              tasks
                .sort(
                  (a, b) =>
                    parseLocalDate(a.start_date).getTime() -
                    parseLocalDate(b.start_date).getTime(),
                )
                .map((task) => {
                  const taskColor = getTaskColor(task, calendars);
                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        onTaskClick(task);
                        onClose();
                      }}
                      className="group/task p-3 rounded-xl hover:shadow-lg cursor-pointer transition-all duration-300"
                      style={{
                        background: `linear-gradient(135deg, ${taskColor}1a 0%, ${taskColor}0d 100%)`,
                        borderLeft: `4px solid ${taskColor}`,
                      }}
                    >
                      <div className="font-semibold text-slate-800 text-sm">
                        {task.title}
                      </div>
                      {task.location && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span>{task.location}</span>
                        </div>
                      )}
                      {task.description && (
                        <div
                          className="prose prose-sm mt-1 text-slate-600 max-w-none"
                          dangerouslySetInnerHTML={{ __html: task.description }}
                        />
                      )}
                      <div className="flex items-center justify-between mt-2 text-xs text-slate-600 font-medium">
                        <span>
                          {format(parseLocalDate(task.start_date), "HH:mm")} -{" "}
                          {format(parseLocalDate(task.end_date), "HH:mm")}
                        </span>
                        {task.calendar_source_name && (
                          <div
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: `${taskColor}26`,
                              color: taskColor,
                            }}
                          >
                            {task.calendar_source_name}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            ) : (
              <p className="text-center text-slate-500 py-8">
                Aucun événement pour ce jour.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  },
);
DayTasksModal.displayName = "DayTasksModal";

const TaskItem = ({
  task,
  onTaskClick,
  dragListeners,
  dragAttributes,
  calendars,
}: {
  task: Task;
  onTaskClick: (task: Task) => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  calendars: CalendarSource[];
}) => {
  const taskColor = getTaskColor(task, calendars);
  return (
    <div
      className="text-xs p-1.5 pr-1 text-black flex items-center gap-1 group/item"
      style={{
        background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
        borderLeft: `3px solid ${taskColor}`,
      }}
    >
      <div
        {...dragListeners}
        {...dragAttributes}
        className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <div
        className="font-semibold truncate flex-1 cursor-pointer min-w-0"
        onClick={(e) => {
          e.stopPropagation();
          onTaskClick(task);
        }}
      >
        {task.title}
      </div>
    </div>
  );
};

const WeekTaskItem = ({
  task,
  onTaskClick,
  dragListeners,
  dragAttributes,
  calendars,
}: {
  task: Task;
  onTaskClick: (task: Task) => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  calendars: CalendarSource[];
}) => {
  const taskColor = getTaskColor(task, calendars);
  return (
    <div
      className="text-xs p-1.5 pr-1 text-black flex items-center gap-1 group/item"
      style={{
        background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
        borderLeft: `3px solid ${taskColor}`,
      }}
    >
      <div
        {...dragListeners}
        {...dragAttributes}
        className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded mt-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3 text-white" />
      </div>
      <div
        className="flex-1 cursor-pointer min-w-0"
        onClick={(e) => {
          e.stopPropagation();
          onTaskClick(task);
        }}
      >
        <div className="font-semibold truncate">{task.title}</div>
        <div className="font-medium mt-0.5">
          {format(parseLocalDate(task.start_date), "HH:mm")} - {format(parseLocalDate(task.end_date), "HH:mm")}
        </div>
      </div>
    </div>
  );
};

// Composant pour les événements positionnés (vue jour/semaine) avec redimensionnement
const PositionedEventItem = ({
  event,
  onTaskClick,
  calendars,
  top,
  height,
  onResize,
}: {
  event: Task;
  onTaskClick: (task: Task) => void;
  calendars: CalendarSource[];
  top: number;
  height: number;
  onResize?: (eventId: string, newHeight: number) => void;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [resizeHeight, setResizeHeight] = useState(height);
  const resizeStartY = useRef(0);
  const originalHeight = useRef(height);

  const taskColor = getTaskColor(event, calendars);

  useEffect(() => {
    setResizeHeight(height);
  }, [height]);

  // Calculer l'heure de fin dynamique pendant le redimensionnement
  const getDisplayEndTime = () => {
    const startDate = parseLocalDate(event.start_date);
    const endDate = addMinutesLocal(startDate, resizeHeight); // 1px = 1 minute
    return format(endDate, "HH:mm");
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    originalHeight.current = resizeHeight;

    let finalHeight = resizeHeight; // Capturer la valeur finale

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - resizeStartY.current;
      const newHeight = Math.max(15, originalHeight.current + deltaY); // Minimum 15px (15 minutes)
      finalHeight = newHeight; // Mettre à jour la valeur finale
      setResizeHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (onResize && finalHeight !== originalHeight.current) {
        console.log(`🔄 Resize: eventId=${event.id}, finalHeight=${finalHeight}px (${finalHeight} minutes)`);
        onResize(event.id, finalHeight);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      className="absolute left-1 right-1 pointer-events-auto"
      style={{
        top: `${top}px`,
        height: `${resizeHeight}px`,
        zIndex: isDragging || isResizing ? 50 : 10,
        opacity: isDragging ? 0 : 1, // ✅ Cacher complètement pendant le drag
      }}
    >
      <div
        className="h-full shadow-md hover:shadow-lg transition-shadow cursor-pointer p-2 overflow-hidden group relative"
        style={{
          background: `linear-gradient(135deg, ${taskColor} 0%, ${taskColor}dd 100%)`,
          borderLeft: `4px solid ${taskColor}`,
        }}
        onClick={(e) => {
          if (!isResizing) {
            e.stopPropagation();
            onTaskClick(event);
          }
        }}
      >
        <div className="flex items-start gap-1 h-full">
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 px-0.5 hover:bg-white/30 rounded flex items-center"
            style={{ height: `${resizeHeight}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3 text-white drop-shadow-sm" style={{ height: '100%' }} />
          </div>
          <div className="flex-1 min-w-0 text-black">
            <div className="font-semibold text-sm truncate">{event.title}</div>
            <div className={`text-xs opacity-90 mt-0.5 font-medium transition-all duration-150 ${isResizing ? 'scale-105 text-white font-bold' : ''}`}>
              {format(parseLocalDate(event.start_date), "HH:mm")} - {getDisplayEndTime()}
            </div>
            {event.location && resizeHeight > 35 && (
              <div className="flex items-center gap-1 text-xs opacity-80 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{event.location}</span>
              </div>
            )}
            {resizeHeight > 50 && event.description && (
              <div className="text-xs opacity-80 mt-1 line-clamp-2">
                {event.description.replace(/<[^>]*>/g, '')}
              </div>
            )}
          </div>
        </div>

        {/* Badge de durée pendant le redimensionnement */}
        {isResizing && (
          <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-sm text-black px-2 py-1 rounded-lg shadow-lg text-xs font-bold animate-pulse border-2 border-white">
            {Math.floor(resizeHeight / 60)}h{String(resizeHeight % 60).padStart(2, '0')}
          </div>
        )}

        {/* Poignée de redimensionnement */}
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center"
          onMouseDown={handleResizeStart}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-1 bg-white/60 rounded-full shadow-sm"></div>
        </div>
      </div>
    </div>
  );
};

// Composant pour les événements positionnés dans la vue semaine (plus compact) avec redimensionnement
const PositionedWeekEventItem = ({
  event,
  onTaskClick,
  calendars,
  top,
  height,
  onResize,
}: {
  event: Task;
  onTaskClick: (task: Task) => void;
  calendars: CalendarSource[];
  top: number;
  height: number;
  onResize?: (eventId: string, newHeight: number) => void;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [resizeHeight, setResizeHeight] = useState(height);
  const resizeStartY = useRef(0);
  const originalHeight = useRef(height);

  const taskColor = getTaskColor(event, calendars);

  useEffect(() => {
    setResizeHeight(height);
  }, [height]);

  // Calculer l'heure de fin dynamique pendant le redimensionnement
  const getDisplayEndTime = () => {
    const startDate = parseLocalDate(event.start_date);
    const endDate = addMinutesLocal(startDate, resizeHeight); // 1px = 1 minute
    return format(endDate, "HH:mm");
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    originalHeight.current = resizeHeight;

    let finalHeight = resizeHeight; // Capturer la valeur finale

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - resizeStartY.current;
      const newHeight = Math.max(15, originalHeight.current + deltaY);
      finalHeight = newHeight; // Mettre à jour la valeur finale
      setResizeHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (onResize && finalHeight !== originalHeight.current) {
        console.log(`🔄 Resize (Week): eventId=${event.id}, finalHeight=${finalHeight}px (${finalHeight} minutes)`);
        onResize(event.id, finalHeight);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      className="absolute left-1 right-1 pointer-events-auto"
      style={{
        top: `${top}px`,
        height: `${resizeHeight}px`,
        zIndex: isDragging || isResizing ? 50 : 10,
        opacity: isDragging ? 0 : 1, // ✅ Cacher complètement pendant le drag
      }}
    >
      <div
        className="h-full shadow-sm hover:shadow-md transition-shadow cursor-pointer p-1 overflow-hidden group text-black text-[10px] relative"
        style={{
          background: `linear-gradient(135deg, ${taskColor} 0%, ${taskColor}dd 100%)`,
          borderLeft: `3px solid ${taskColor}`,
        }}
        onClick={(e) => {
          if (!isResizing) {
            e.stopPropagation();
            onTaskClick(event);
          }
        }}
      >
        <div className="flex items-start gap-0.5 h-full">
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 px-0.5 hover:bg-white/30 rounded flex items-center"
            style={{ height: `${resizeHeight}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-2.5 text-white drop-shadow-sm" style={{ height: '100%' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate leading-tight">{event.title}</div>
            {resizeHeight > 25 && (
              <div className={`opacity-90 mt-0.5 leading-tight font-medium transition-all duration-150 ${isResizing ? 'scale-105 text-white font-bold opacity-100' : ''}`}>
                {format(parseLocalDate(event.start_date), "HH:mm")} - {getDisplayEndTime()}
              </div>
            )}
            {event.location && resizeHeight > 40 && (
              <div className="flex items-center gap-0.5 opacity-80 mt-0.5 leading-tight truncate">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-2 w-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Badge de durée pendant le redimensionnement */}
        {isResizing && (
          <div className="absolute top-1 right-1 bg-white/95 backdrop-blur-sm text-black px-1.5 py-0.5 rounded shadow-lg text-[10px] font-bold animate-pulse border border-white">
            {Math.floor(resizeHeight / 60)}h{String(resizeHeight % 60).padStart(2, '0')}
          </div>
        )}

        {/* Poignée de redimensionnement */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center"
          onMouseDown={handleResizeStart}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-8 h-0.5 bg-white/60 rounded-full shadow-sm"></div>
        </div>
      </div>
    </div>
  );
};

export default function Calendar({
  tasks,
  viewMode,
  mainViewMode,
  currentDate,
  onDateChange,
  onTaskClick,
  onAddTask,
  onTaskDrop,
  onTaskResize,
  calendars = [],
  isNavigating = false,
  pendingDate = null,
}: CalendarProps) {
  const [hours] = useState(Array.from({ length: 24 }, (_, i) => i));
  const currentHourRef = useRef<HTMLDivElement>(null);
  const dayViewRef = useRef<HTMLDivElement>(null);
  const [dayTasksModalDate, setDayTasksModalDate] = useState<Date | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Configurer les sensors pour un drag & drop plus fluide
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5, // 5px de mouvement avant d'activer le drag
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 5,
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  // Handler pour le redimensionnement des événements
  const handleEventResize = useCallback((eventId: string, newHeight: number) => {
    if (!onTaskResize) return;

    const task = tasks.find(t => t.id === eventId);
    if (!task) return;

    const startDate = parseLocalDate(task.start_date);
    // Calculer la nouvelle date de fin basée sur la nouvelle hauteur (1px = 1 minute)
    const newEndDate = addMinutesLocal(startDate, newHeight);

    console.log(`📏 handleEventResize: eventId=${eventId}, height=${newHeight}px → newEndDate=${format(newEndDate, "dd/MM/yyyy HH:mm")}`);
    onTaskResize(eventId, newEndDate);
  }, [tasks, onTaskResize]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
      console.log('🎯 Drag start:', task.id, format(parseLocalDate(task.start_date), "dd/MM/yyyy HH:mm"));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;

    if (!over) {
      console.log('⚠️ Drop sans cible');
      return;
    }

    if (active.id === over.id) {
      console.log('⚠️ Drop sur la même position');
      return;
    }

    const taskId = active.id as string;
    const dropTargetDate = over.data.current?.date as Date;

    console.log('🎯 handleDragEnd:', {
      taskId,
      dropTargetDate: dropTargetDate ? format(dropTargetDate, "dd/MM/yyyy HH:mm:ss") : 'undefined',
      dropTargetDateISO: dropTargetDate?.toISOString(),
      dropTargetHours: dropTargetDate?.getHours(),
      dropTargetMinutes: dropTargetDate?.getMinutes(),
    });

    if (!taskId || !dropTargetDate) {
      console.log('⚠️ Données manquantes:', { taskId, dropTargetDate });
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      console.log('⚠️ Tâche non trouvée:', taskId);
      return;
    }

    // Créer une copie de la date cible pour éviter les mutations
    const newDate = new Date(dropTargetDate);

    // En mode groupe, préserver l'heure originale de la tâche
    if (mainViewMode === "group") {
      const oldStartDate = parseLocalDate(task.start_date);
      newDate.setHours(
        oldStartDate.getHours(),
        oldStartDate.getMinutes(),
        oldStartDate.getSeconds(),
        oldStartDate.getMilliseconds(),
      );
    }

    // Vérifier que la date a changé
    const oldDate = parseLocalDate(task.start_date);
    if (oldDate.getTime() === newDate.getTime()) {
      console.log('⚠️ Même date/heure');
      return;
    }

    console.log('✅ Drop:', {
      taskId,
      oldDate: format(oldDate, "dd/MM/yyyy HH:mm"),
      newDate: format(newDate, "dd/MM/yyyy HH:mm"),
      newDateHours: newDate.getHours(),
      newDateMinutes: newDate.getMinutes(),
    });

    onTaskDrop(taskId, newDate);
  };

  // Scroll automatique désactivé
  // useEffect(() => {
  //   if (
  //     (viewMode === "day" || viewMode === "week") &&
  //     currentHourRef.current
  //   ) {
  //     setTimeout(() => {
  //       if (currentHourRef.current) {
  //         // Utiliser scrollIntoView pour scroller la page vers l'heure actuelle
  //         currentHourRef.current.scrollIntoView({
  //           behavior: 'smooth',
  //           block: 'center',
  //           inline: 'nearest'
  //         });
  //       }
  //     }, 100);
  //   }
  // }, [viewMode, currentDate]);

  // Calculer les événements positionnés pour la vue jour/semaine
  const positionedEvents = useMemo(() => {
    return tasks.map(task => {
      // Créer les objets Date à partir des chaînes ISO - SANS conversion timezone
      const startDate = parseLocalDate(task.start_date);
      const endDate = parseLocalDate(task.end_date);

      // Calculer la position en pixels (60px par heure) en utilisant directement les heures/minutes locales
      const startHour = startDate.getHours();
      const startMinute = startDate.getMinutes();
      const top = (startHour * 60) + startMinute; // pixels from top


      // Calculer la durée en minutes
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      const height = Math.max(durationMinutes, 15); // minimum 15px (15 minutes)

      return {
        ...task,
        top,
        height,
        startDate,
        endDate,
      };
    });
  }, [tasks]);

  const getTasksForDate = useCallback(
    (date: Date) => {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      return tasks.filter((task) => {
        const taskStart = parseLocalDate(task.start_date);
        const taskEnd = parseLocalDate(task.end_date);
        return taskStart <= dayEnd && taskEnd >= dayStart;
      });
    },
    [tasks],
  );

  // Obtenir les événements positionnés pour une journée spécifique
  const getPositionedEventsForDay = useCallback(
    (date: Date) => {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      return positionedEvents.filter((event) => {
        return event.startDate <= dayEnd && event.endDate >= dayStart;
      });
    },
    [positionedEvents],
  );

  const navigatePrevious = useCallback(() => {
    if (isNavigating) {
      console.log('⏳ Navigation en cours, clic ignoré');
      return;
    }

    const newDate = new Date(currentDate);
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    onDateChange(newDate);
  }, [currentDate, viewMode, onDateChange, isNavigating]);

  const navigateNext = useCallback(() => {
    if (isNavigating) {
      console.log('⏳ Navigation en cours, clic ignoré');
      return;
    }

    const newDate = new Date(currentDate);
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onDateChange(newDate);
  }, [currentDate, viewMode, onDateChange, isNavigating]);

  const getDateRange = useMemo(() => {
    if (viewMode === "day") {
      return format(currentDate, "EEEE d MMMM yyyy", { locale: fr });
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, "d MMM", { locale: fr })} - ${format(end, "d MMM yyyy", { locale: fr })}`;
    } else {
      return format(currentDate, "MMMM yyyy", { locale: fr });
    }
  }, [viewMode, currentDate]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  const calendarDays = useMemo(() => {
    if (mainViewMode === 'group') {
      // Pour la vue groupe en mode mois, afficher uniquement les jours du mois en cours
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return eachDayOfInterval({ start: monthStart, end: monthEnd });
    } else {
      // Pour la vue personnelle, afficher la grille complète (avec les jours des mois adjacents)
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }
  }, [currentDate, mainViewMode]);

  const weekDayLabels = useMemo(
    () => ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    [],
  );

  // Group calendars by user for group view
  const calendarsByUser = useMemo(() => {
    const grouped: { [key: string]: CalendarSource[] } = {};
    calendars.forEach((cal) => {
      // Filtrer les calendriers de type ressource (description contient "Ressources")
      console.log(cal)
      if (cal.description && cal.description.includes("Resource")) {
        return; // Ne pas inclure les calendriers de ressource
      }

      const username = cal.displayname || "Unknown";
      if (!grouped[username]) {
        grouped[username] = [];
      }
      grouped[username].push(cal);
    });
    return grouped;
  }, [calendars]);

  // Determine which days to display in group view based on viewMode
  const daysToDisplay = useMemo(() => {
    if (viewMode === 'day') {
      return [currentDate];
    } else if (viewMode === 'week') {
      return weekDays;
    } else {
      // month view
      return calendarDays;
    }
  }, [viewMode, currentDate, weekDays, calendarDays]);

  const Draggable = ({
    task,
    type = "month",
  }: {
    task: Task;
    type?: "month" | "week";
  }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: task.id,
    });

    return (
      <div ref={setNodeRef} style={{ opacity: isDragging ? 0.5 : 1 }}>
        {type === "month" ? (
          <TaskItem
            task={task}
            onTaskClick={onTaskClick}
            dragListeners={listeners}
            dragAttributes={attributes}
            calendars={calendars}
          />
        ) : (
          <WeekTaskItem
            task={task}
            onTaskClick={onTaskClick}
            dragListeners={listeners}
            dragAttributes={attributes}
            calendars={calendars}
          />
        )}
      </div>
    );
  };

  const DroppableCell = ({
    id,
    date,
    children,
    className = "",
  }: {
    id: string;
    date: Date;
    children: React.ReactNode;
    className?: string;
  }) => {
    const { setNodeRef, isOver } = useDroppable({ id, data: { date } });

    return (
      <div
        ref={setNodeRef}
        className={`${className} ${isOver ? "bg-blue-100/50" : ""}`}
      >
        {children}
      </div>
    );
  };

  const renderDayView = () => {
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    const isToday = isSameDay(currentDate, new Date());
    const dayEvents = getPositionedEventsForDay(currentDate);

    return (
      <div
        ref={dayViewRef}
        className="flex-1 bg-linear-to-br from-slate-50/30 to-blue-50/20"
      >
        <div className="min-h-full flex relative">
          {/* Colonne des heures - version compacte */}
          <div className="w-14 shrink-0 bg-linear-to-r from-slate-50 to-blue-50/50 border-r border-slate-300">
            {hours.map((hour) => {
              const isCurrentHour = isToday && hour === currentHour;

              return (
                <div
                  key={hour}
                  ref={isCurrentHour ? currentHourRef : null}
                  className="relative"
                  style={{ height: "60px" }}
                >
                  <div
                    className={`px-1.5 py-0.5 text-[10px] font-semibold transition-all duration-200 ${
                      isCurrentHour
                        ? "text-[#005f82] font-bold"
                        : "text-slate-700"
                    }`}
                  >
                    {`${hour.toString().padStart(2, "0")}:00`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zone des événements avec grille */}
          <div className="flex-1 relative">
            {/* Grille de fond avec lignes pour les quarts d'heure */}
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: "60px" }}>
                {/* Ligne principale de l'heure (épaisse) */}
                <div className="absolute top-0 left-0 right-0 border-t-2 border-slate-300"></div>


                {/* Zone cliquable pour ajouter un événement */}
                <DroppableCell
                  id={`${format(currentDate, "yyyy-MM-dd")}-${hour}`}
                  date={new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), hour, 0, 0, 0)}
                  className="absolute inset-0 hover:bg-blue-50/30 transition-colors cursor-pointer"
                >
                  <div
                    className="w-full h-full"
                    onClick={(e) => {
                      // Calculer la minute exacte basée sur la position du clic
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickY = e.clientY - rect.top;
                      const minute = Math.floor((clickY / 60) * 60); // 60px = 60 minutes

                      const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), hour, minute, 0, 0);

                      console.log(`➕ Clic pour créer événement: ${hour}:${minute.toString().padStart(2, '0')}`);
                      onAddTask(newDate);
                    }}
                  ></div>
                </DroppableCell>
              </div>
            ))}

            {/* Ligne de l'heure actuelle */}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${currentHour * 60 + currentMinute}px` }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                  <div className="flex-1 h-0.5 bg-red-500"></div>
                </div>
              </div>
            )}

            {/* Événements positionnés en absolu */}
            <div className="absolute inset-0 pointer-events-none" style={{ paddingLeft: "4px", paddingRight: "4px" }}>
              {dayEvents.map((event) => {
                // Calculer la position en utilisant les heures/minutes locales
                const topOffset = event.top; // déjà calculé dans positionedEvents

                return (
                  <PositionedEventItem
                    key={event.id}
                    event={event}
                    onTaskClick={onTaskClick}
                    calendars={calendars}
                    top={topOffset}
                    height={event.height}
                    onResize={handleEventResize}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    const today = new Date();

    return (
      <div ref={dayViewRef} className="flex-1 bg-white">
        {/* En-tête avec les jours de la semaine - version compacte */}
        <div className="flex border-b border-slate-300 sticky top-0 z-20 bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="w-14 shrink-0 border-r border-slate-300"></div>
          {weekDays.map((day) => (
            <div
              key={day.toString()}
              className="flex-1 min-w-[100px] py-1 px-1.5 text-center border-r border-slate-200"
            >
              <div
                className={`font-medium text-[10px] leading-tight ${isSameDay(day, today) ? "text-[#005f82]" : "text-slate-600"}`}
              >
                {format(day, "EEE", { locale: fr })}
              </div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  isSameDay(day, today)
                    ? "bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white w-6 h-6 rounded-lg flex items-center justify-center mx-auto shadow-sm text-xs"
                    : "text-slate-800"
                }`}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Contenu avec grille horaire */}
        <div className="min-h-full flex relative">
          {/* Colonne des heures - version compacte */}
          <div className="w-14 flex-shrink-0 bg-gradient-to-r from-slate-50 to-blue-50/50 border-r border-slate-300 sticky left-0 z-10">
            {hours.map((hour) => {
              const isCurrentHour = hour === currentHour;

              return (
                <div
                  key={hour}
                  ref={isCurrentHour ? currentHourRef : null}
                  className="relative"
                  style={{ height: "60px" }}
                >
                  <div
                    className={`px-1.5 py-0.5 text-[10px] font-semibold transition-all duration-200 ${
                      isCurrentHour
                        ? "text-[#005f82] font-bold"
                        : "text-slate-700"
                    }`}
                  >
                    {`${hour.toString().padStart(2, "0")}:00`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Colonnes des jours */}
          {weekDays.map((day) => {
            const dayEvents = getPositionedEventsForDay(day);
            const isToday = isSameDay(day, today);

            return (
              <div
                key={day.toString()}
                className="flex-1 min-w-[100px] border-r border-slate-200 relative"
              >
                {/* Grille de fond avec lignes pour les quarts d'heure */}
                {hours.map((hour) => (
                  <div key={hour} className="relative" style={{ height: "60px" }}>
                    {/* Ligne principale de l'heure (épaisse) */}
                    <div className="absolute top-0 left-0 right-0 border-t-2 border-slate-300"></div>


                    {/* Zone cliquable pour ajouter un événement */}
                    <DroppableCell
                      id={`${format(day, "yyyy-MM-dd")}-${hour}`}
                      date={new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0)}
                      className="absolute inset-0 hover:bg-blue-50/30 transition-colors cursor-pointer"
                    >
                      <div
                        className="w-full h-full"
                        onClick={(e) => {
                          // Calculer la minute exacte basée sur la position du clic
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickY = e.clientY - rect.top;
                          const minute = Math.floor((clickY / 60) * 60); // 60px = 60 minutes

                          const newDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);

                          console.log(`➕ Clic pour créer événement: ${format(day, 'dd/MM')} ${hour}:${minute.toString().padStart(2, '0')}`);
                          onAddTask(newDate);
                        }}
                      ></div>
                    </DroppableCell>
                  </div>
                ))}

                {/* Ligne de l'heure actuelle pour aujourd'hui */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${currentHour * 60 + currentMinute}px` }}
                  >
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                      <div className="flex-1 h-0.5 bg-red-500"></div>
                    </div>
                  </div>
                )}

                {/* Événements positionnés en absolu */}
                <div className="absolute inset-0 pointer-events-none" style={{ paddingLeft: "2px", paddingRight: "2px" }}>
                  {dayEvents.map((event) => {
                    // Calculer la position en utilisant les heures/minutes locales
                    const topOffset = event.top; // déjà calculé dans positionedEvents

                    // Limiter la hauteur à la fin de la journée
                    const maxHeight = (24 * 60) - topOffset;
                    const displayHeight = Math.min(event.height, maxHeight);

                    return (
                      <PositionedWeekEventItem
                        key={event.id}
                        event={event}
                        onTaskClick={onTaskClick}
                        calendars={calendars}
                        top={topOffset}
                        height={displayHeight}
                        onResize={handleEventResize}
                      />
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

  const renderMonthView = () => {
    return (
      <div className="flex-1 flex flex-col bg-white">
        {/* En-tête des jours de la semaine - responsive */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 sticky top-0 z-10">
          {weekDayLabels.map((day) => (
            <div
              key={day}
              className="p-1.5 sm:p-3 text-center font-semibold text-slate-700 border-r border-slate-200 last:border-r-0 text-xs sm:text-sm"
            >
              {/* Afficher version courte sur mobile, complète sur desktop */}
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.substring(0, 3)}</span>
            </div>
          ))}
        </div>

        {/* Grille des jours - responsive avec hauteur minimale ajustée */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr">
          {calendarDays.map((day) => {
            const dayTasks = getTasksForDate(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={day.toString()}
                className={`border-r border-b border-slate-200 min-h-[80px] sm:min-h-[120px] ${!isCurrentMonth ? "bg-slate-50/50" : ""}`}
              >
                <DroppableCell
                  id={format(day, "yyyy-MM-dd")}
                  date={day}
                  className="h-full"
                >
                  <div className="p-1 sm:p-2 h-full flex flex-col" onClick={() => onAddTask(day)}>
                    {/* Numéro du jour - plus visible */}
                    <div
                      className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 flex-shrink-0 ${
                        isToday
                          ? "bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white rounded-lg sm:rounded-xl w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center shadow-md"
                          : isCurrentMonth
                            ? "text-slate-800"
                            : "text-slate-400"
                      }`}
                    >
                      {format(day, "d")}
                    </div>

                    {/* Événements - responsive */}
                    <div className="space-y-0.5 sm:space-y-1 flex-1 overflow-hidden">
                      {dayTasks
                        .filter((t) => isSameDay(new Date(t.start_date), day))
                        .slice(0, 2) // Limiter à 2 sur mobile, 3 sur desktop géré par CSS
                        .map((task) => (
                          <div key={task.id} className="hidden sm:block">
                            <Draggable task={task} />
                          </div>
                        ))}

                      {/* Indicateur du nombre d'événements sur mobile */}
                      {dayTasks.length > 0 && (
                        <div className="sm:hidden">
                          <div className="text-[10px] font-semibold text-[#005f82] bg-blue-50 rounded px-1.5 py-0.5 inline-block">
                            {dayTasks.length} événement{dayTasks.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      )}

                      {/* Sur desktop, afficher les événements et le lien "autres" */}
                      <div className="hidden sm:block space-y-1">
                        {dayTasks
                          .filter((t) => isSameDay(new Date(t.start_date), day))
                          .slice(2, 3)
                          .map((task) => (
                            <Draggable key={task.id} task={task} />
                          ))}
                        {dayTasks.length > 3 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDayTasksModalDate(day);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold pl-1 text-left w-full hover:underline"
                          >
                            +{dayTasks.length - 3} autre{dayTasks.length - 3 > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </DroppableCell>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGroupView = () => {
    // Déterminer la largeur des cellules en fonction du mode de vue
    const cellWidth = viewMode === 'month' ? 'w-[120px]' : 'flex-1 min-w-[100px]';

    // Calculer le nombre total de lignes de calendrier
    const totalCalendarRows = Object.values(calendarsByUser).reduce(
      (acc, userCalendars) => acc + userCalendars.length,
      0
    );

    // Hauteur minimale par ligne de calendrier pour remplir l'écran
    const minRowHeight = totalCalendarRows > 0 ? Math.max(60, Math.floor(600 / totalCalendarRows)) : 60;

    return (
      <div className="flex-1 bg-white overflow-x-auto min-h-[calc(100vh-250px)]">
        <div className="inline-flex min-w-full h-full">
          <div className="flex-1 flex flex-col h-full">
            <div className="flex border-b border-slate-200 sticky top-0 z-10 bg-linear-to-r from-slate-50 to-blue-50">
              <div className="w-48 shrink-0 border-r border-slate-200 py-1 px-2 text-left font-semibold text-slate-700 text-xs sticky left-0 bg-slate-50 z-20">
                Collaborateur / Calendrier
              </div>
              {daysToDisplay.map((day) => (
                <div
                  key={day.toString()}
                  className={`${cellWidth} shrink-0 py-1 px-1.5 text-center border-r border-slate-200`}
                >
                  <div
                    className={`font-medium text-[10px] leading-tight ${isSameDay(day, new Date()) ? "text-[#005f82]" : "text-slate-600"}`}
                  >
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      isSameDay(day, new Date())
                        ? "bg-linear-to-r from-[#005f82] to-[#007ba8] text-white w-6 h-6 rounded-lg flex items-center justify-center mx-auto shadow-sm text-xs"
                        : "text-slate-800"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex-1 flex flex-col">
              {Object.entries(calendarsByUser).map(([username, userCalendars]) => (
                <div key={username} className="flex-1">
                  <div className="flex border-b border-slate-200 bg-slate-50/50">
                    <div className="w-48 shrink-0 border-r border-slate-200 p-2 font-bold text-slate-800 text-sm sticky left-0 bg-slate-50/50 z-10">
                      {/*{username}*/}
                    </div>
                    {daysToDisplay.map((day) => (
                      <div
                        key={day.toString()}
                        className={`${cellWidth} shrink-0 p-1 border-r border-slate-200`}
                      />
                    ))}
                  </div>
                  {userCalendars.map((calendar) => (
                    <div
                      key={calendar.id}
                      className="flex border-b border-slate-200 group hover:bg-blue-50/20 transition-colors duration-200"
                      style={{ minHeight: `${minRowHeight}px` }}
                    >
                      <div className="w-48 shrink-0 border-r border-slate-200 p-2 text-sm text-slate-700 font-medium flex items-center gap-2 sticky left-0 bg-white group-hover:bg-blue-50/20 z-10">
                        <div
                          className="w-3 h-3 rounded-full shadow-sm"
                          style={{ backgroundColor: calendar.calendarcolor }}
                        ></div>
                        <span className="truncate">{calendar.defined_name || calendar.share_href || calendar.displayname}</span>
                      </div>
                      {daysToDisplay.map((day) => {
                        const dayTasks = tasks.filter(
                          (task) =>
                            task.calendar_source_id === calendar.id &&
                            isSameDay(new Date(task.start_date), day),
                        );
                        const cellDate = new Date(day);
                        // For group view, tasks are by day, not hour. So we use the start of the day for dropping.
                        cellDate.setHours(0, 0, 0, 0);

                        return (
                          <DroppableCell
                            key={day.toString()}
                            id={`${format(day, "yyyy-MM-dd")}-${calendar.id}`} // Unique ID for droppable cell
                            date={cellDate}
                            className={`${cellWidth} shrink-0 p-1 border-r border-slate-200 cursor-pointer h-full`}
                          >
                            <div className="space-y-1">
                              {dayTasks.map((task) => (
                                <Draggable key={task.id} task={task} type="week" />
                              ))}
                            </div>
                          </DroppableCell>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Ajouter les appels API pour récupérer les calendriers et événements
  useEffect(() => {
    if (mainViewMode === 'group') {
      // Récupérer les calendriers de groupe
      baikalAPI.getCalendars().then((response) => {
        console.log("Calendriers de groupe:", response.data);
      });

      // Récupérer les événements pour une période donnée
      baikalAPI.getEvents({ start_date: "2025-12-01", end_date: "2025-12-31" }).then((response) => {
        console.log("Événements de groupe:", response.data);
      });
    }
  }, [mainViewMode]);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col bg-white rounded-lg sm:rounded-2xl shadow-xl border border-slate-200/50 animate-fadeIn">
          {/* Calendar Header - Version compacte */}
          <div className="flex items-center justify-between p-1.5 sm:p-2.5 border-b border-slate-200/50 bg-gradient-to-r from-white via-blue-50/40 to-white backdrop-blur-sm">
            <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center">
              <button
                onClick={navigatePrevious}
                disabled={isNavigating}
                className={`group p-1 sm:p-1.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg transition-all duration-300 text-slate-700 hover:shadow-md border border-transparent hover:border-[#005f82]/20 ${isNavigating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Période précédente"
              >
                {isNavigating ? (
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-[#005f82] rounded-full animate-spin" />
                ) : (
                  <ChevronLeft className="w-4 h-4 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:-translate-x-1" />
                )}
              </button>
              <div className="text-center flex-1 px-1">
                <h2 className="text-xs sm:text-base font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent capitalize">
                  {getDateRange}
                  {isNavigating && (
                    <span className="ml-1 text-[10px] text-slate-500 font-normal">Chargement...</span>
                  )}
                </h2>
              </div>
              <button
                onClick={navigateNext}
                disabled={isNavigating}
                className={`group p-1 sm:p-1.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg transition-all duration-300 text-slate-700 hover:shadow-md border border-transparent hover:border-[#005f82]/20 ${isNavigating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Période suivante"
              >
                {isNavigating ? (
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-[#005f82] rounded-full animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:translate-x-1" />
                )}
              </button>
            </div>
          </div>

          {mainViewMode === "personal" ? (
            <>
              {viewMode === "day" && renderDayView()}
              {viewMode === "week" && renderWeekView()}
              {viewMode === "month" && renderMonthView()}
            </>
          ) : (
            <>
              {viewMode === "day" && renderGroupView()}
              {viewMode === "week" && renderGroupView()}
              {viewMode === "month" && renderGroupView()}
            </>
          )}
        </div>
        <DragOverlay>
          {activeTask ? (
            viewMode === "month" ? (
              <TaskItem task={activeTask} onTaskClick={onTaskClick} calendars={calendars} />
            ) : (
              <WeekTaskItem task={activeTask} onTaskClick={onTaskClick} calendars={calendars} />
            )
          ) : null}
        </DragOverlay>
      </DndContext>
      {dayTasksModalDate && (
        <DayTasksModal
          date={dayTasksModalDate}
          tasks={getTasksForDate(dayTasksModalDate)}
          onClose={() => setDayTasksModalDate(null)}
          onTaskClick={onTaskClick}
          calendars={calendars}
        />
      )}
    </>
  );
}
