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
} from "@dnd-kit/core";
import { Task, ViewMode, CalendarSource } from "@/lib/types";
import { baikalAPI } from "@/lib/api";

interface CalendarProps {
  tasks: Task[];
  viewMode: ViewMode;
  mainViewMode: 'personal' | 'group';
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (date: Date, hour?: number) => void;
  onTaskDrop: (taskId: number, newDate: Date) => void;
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
                    new Date(a.start_date).getTime() -
                    new Date(b.start_date).getTime(),
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
                      {task.description && (
                        <div
                          className="prose prose-sm mt-1 text-slate-600 max-w-none"
                          dangerouslySetInnerHTML={{ __html: task.description }}
                        />
                      )}
                      <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
                        <span>
                          {format(new Date(task.start_date), "HH:mm")} -{" "}
                          {format(new Date(task.end_date), "HH:mm")}
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
  dragListeners?: any;
  dragAttributes?: any;
  calendars: CalendarSource[];
}) => {
  const taskColor = getTaskColor(task, calendars);
  return (
    <div
      className="text-xs p-1.5 pr-1 text-white rounded-lg flex items-center gap-1 group/item"
      style={{
        background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
        borderLeft: `3px solid ${taskColor}`,
      }}
    >
      <div
        {...dragListeners}
        {...dragAttributes}
        className="cursor-grab active:cursor-grabbing flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded"
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
  dragListeners?: any;
  dragAttributes?: any;
  calendars: CalendarSource[];
}) => {
  const taskColor = getTaskColor(task, calendars);
  return (
    <div
      className="mb-0.5 p-1.5 pl-1 rounded-lg hover:shadow-md transition-all text-[10px] flex items-start gap-1 group/item"
      style={{
        background: `linear-gradient(to right, ${taskColor}, ${taskColor}dd)`,
        borderLeft: `3px solid ${taskColor}`,
      }}
    >
      <div
        {...dragListeners}
        {...dragAttributes}
        className="cursor-grab active:cursor-grabbing flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 hover:bg-white/20 rounded mt-0.5"
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
        <div className="font-semibold text-white truncate">{task.title}</div>
        <div className="text-white/80 font-medium mt-0.5">
          {format(new Date(task.start_date), "HH:mm")}
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
  calendars = [],
  isNavigating = false,
  pendingDate = null,
}: CalendarProps) {
  const [hours] = useState(Array.from({ length: 24 }, (_, i) => i));
  const currentHourRef = useRef<HTMLDivElement>(null);
  const dayViewRef = useRef<HTMLDivElement>(null);
  const [dayTasksModalDate, setDayTasksModalDate] = useState<Date | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const taskId = active.id as number;
      const newDate = over.data.current?.date as Date;

      if (taskId && newDate) {
        const task = tasks.find((t) => t.id === taskId);

        if (task && mainViewMode === "group") {
          // Preserve original time when dropping in group view
          const oldStartDate = new Date(task.start_date);
          newDate.setHours(
            oldStartDate.getHours(),
            oldStartDate.getMinutes(),
            oldStartDate.getSeconds(),
            oldStartDate.getMilliseconds(),
          );
        }

        // Prevent drop if the date/time is identical
        if (task && new Date(task.start_date).getTime() === newDate.getTime()) {
          return;
        }
        onTaskDrop(taskId, newDate);
      }
    }
  };

  useEffect(() => {
    if (
      (viewMode === "day" || viewMode === "week") &&
      currentHourRef.current &&
      dayViewRef.current
    ) {
      setTimeout(() => {
        if (currentHourRef.current && dayViewRef.current) {
          const containerHeight = dayViewRef.current.clientHeight;
          const hourPosition = currentHourRef.current.offsetTop;
          dayViewRef.current.scrollTop = hourPosition - containerHeight / 3;
        }
      }, 100);
    }
  }, [viewMode, currentDate]);

  const tasksByDateTime = useMemo(() => {
    const map = new Map<string, Task[]>();

    tasks.forEach((task) => {
      const taskStart = new Date(task.start_date);
      const taskEnd = new Date(task.end_date);

      let current = new Date(taskStart);
      while (current < taskEnd) {
        const dateKey = format(current, "yyyy-MM-dd");
        const hour = current.getHours();
        const key = `${dateKey}-${hour}`;

        if (!map.has(key)) {
          map.set(key, []);
        }
        if (!map.get(key)!.find((t) => t.id === task.id)) {
          map.get(key)!.push(task);
        }

        current = new Date(current.getTime() + 60 * 60 * 1000);
      }
    });

    return map;
  }, [tasks]);

  const getTasksForDate = useCallback(
    (date: Date, hour?: number) => {
      const dateKey = format(date, "yyyy-MM-dd");

      if (hour !== undefined) {
        const key = `${dateKey}-${hour}`;
        return tasksByDateTime.get(key) || [];
      }

      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      return tasks.filter((task) => {
        const taskStart = new Date(task.start_date);
        const taskEnd = new Date(task.end_date);
        return taskStart <= dayEnd && taskEnd >= dayStart;
      });
    },
    [tasks, tasksByDateTime],
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
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const weekDayLabels = useMemo(
    () => ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    [],
  );

  // Group calendars by user for group view
  const calendarsByUser = useMemo(() => {
    const grouped: { [key: string]: CalendarSource[] } = {};
    calendars.forEach((cal) => {
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
    const isToday = isSameDay(currentDate, new Date());

    return (
      <div
        ref={dayViewRef}
        className="flex-1 overflow-y-scroll bg-gradient-to-br from-slate-50/30 to-blue-50/20"
      >
        <div className="min-h-full">
          {hours.map((hour) => {
            const hourTasks = getTasksForDate(currentDate, hour);
            const isCurrentHour = hour === currentHour;
            const shouldHighlight = isToday && isCurrentHour;
            const cellDate = new Date(currentDate);
            cellDate.setHours(hour);

            return (
              <div
                key={hour}
                ref={isCurrentHour ? currentHourRef : null}
                className={`group flex border-b border-slate-200/50 transition-all duration-200 ${
                  shouldHighlight ? "bg-blue-50/70 shadow-inner" : ""
                }`}
                style={{ minHeight: "50px" }}
              >
                <div
                  className={`w-16 flex-shrink-0 bg-gradient-to-r from-slate-50 to-blue-50/50 px-2 py-1 text-xs font-semibold border-r border-slate-200/50 transition-all duration-200 ${
                    shouldHighlight
                      ? "text-[#005f82] font-bold"
                      : "text-slate-700 group-hover:text-[#005f82]"
                  }`}
                >
                  {`${hour.toString().padStart(2, "0")}:00`}
                </div>
                <DroppableCell
                  id={`${format(currentDate, "yyyy-MM-dd")}-${hour}`}
                  date={cellDate}
                  className="flex-1 p-2 cursor-pointer"
                >
                  {hourTasks.map((task) => (
                    <Draggable key={task.id} task={task} type="week" />
                  ))}
                </DroppableCell>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const currentHour = new Date().getHours();

    return (
      <div ref={dayViewRef} className="flex-1 overflow-auto bg-white">
        <div className="flex border-b border-slate-200 sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="w-16 flex-shrink-0 border-r border-slate-200"></div>
          {weekDays.map((day) => (
            <div
              key={day.toString()}
              className="flex-1 min-w-[100px] p-2 text-center border-r border-slate-200"
            >
              <div
                className={`font-semibold text-xs ${isSameDay(day, new Date()) ? "text-[#005f82]" : "text-slate-600"}`}
              >
                {format(day, "EEE", { locale: fr })}
              </div>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  isSameDay(day, new Date())
                    ? "bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white w-8 h-8 rounded-xl flex items-center justify-center mx-auto shadow-md text-sm"
                    : "text-slate-800"
                }`}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        <div className="min-h-full">
          {hours.map((hour) => {
            const isCurrentHour = hour === currentHour;

            return (
              <div
                key={hour}
                ref={isCurrentHour ? currentHourRef : null}
                className={`flex border-b border-slate-200 transition-all duration-200 ${
                  isCurrentHour ? "bg-blue-50/70 shadow-inner" : ""
                }`}
                style={{ minHeight: "50px" }}
              >
                <div
                  className={`w-16 flex-shrink-0 bg-gradient-to-r from-slate-50 to-blue-50 px-2 py-1 text-xs font-semibold border-r border-slate-200 transition-all duration-200 ${
                    isCurrentHour
                      ? "text-[#005f82] font-bold"
                      : "text-slate-700"
                  }`}
                >
                  {`${hour.toString().padStart(2, "0")}:00`}
                </div>
                {weekDays.map((day) => {
                  const dayTasks = getTasksForDate(day, hour);
                  const cellDate = new Date(day);
                  cellDate.setHours(hour);

                  return (
                    <DroppableCell
                      key={day.toString()}
                      id={`${format(day, "yyyy-MM-dd")}-${hour}`}
                      date={cellDate}
                      className="flex-1 min-w-[100px] p-1 border-r border-slate-200 cursor-pointer"
                    >
                      {dayTasks.map((task) => (
                        <Draggable key={task.id} task={task} type="week" />
                      ))}
                    </DroppableCell>
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
    return (
      <div className="flex-1 flex flex-col bg-white overflow-auto">
        {/* En-tête des jours de la semaine - responsive */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 sticky top-0 z-10">
          {weekDayLabels.map((day, index) => (
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

    return (
      <div className="flex-1 overflow-auto bg-white">
        <div className="flex border-b border-slate-200 sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="w-48 flex-shrink-0 border-r border-slate-200 p-2 text-left font-semibold text-slate-700">
            Collaborateur / Calendrier
          </div>
          {daysToDisplay.map((day) => (
            <div
              key={day.toString()}
              className="flex-1 min-w-[100px] p-2 text-center border-r border-slate-200"
            >
              <div
                className={`font-semibold text-xs ${isSameDay(day, new Date()) ? "text-[#005f82]" : "text-slate-600"}`}
              >
                {format(day, "EEE", { locale: fr })}
              </div>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  isSameDay(day, new Date())
                    ? "bg-gradient-to-r from-[#005f82] to-[#007ba8] text-white w-8 h-8 rounded-xl flex items-center justify-center mx-auto shadow-md text-sm"
                    : "text-slate-800"
                }`}
              >
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>
        <div className="min-h-full">
          {Object.entries(calendarsByUser).map(([username, userCalendars]) => (
            <div key={username}>
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                <div className="w-48 shrink-0 border-r border-slate-200 p-2 font-bold text-slate-800 text-sm">
                  {/*{username}*/}
                </div>
                {daysToDisplay.map((day) => (
                  <div
                    key={day.toString()}
                    className="flex-1 min-w-[100px] p-1 border-r border-slate-200"
                  />
                ))}
              </div>
              {userCalendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex border-b border-slate-200 group hover:bg-blue-50/20 transition-colors duration-200"
                >
                  <div className="w-48 shrink-0 border-r border-slate-200 p-2 text-sm text-slate-700 font-medium flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: calendar.calendarcolor }}
                    ></div>
                    <span className="truncate">{calendar.displayname}</span>
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
                        className="flex-1 min-w-[100px] p-1 border-r border-slate-200 cursor-pointer"
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
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-col h-full bg-white rounded-lg sm:rounded-2xl overflow-hidden shadow-xl border border-slate-200/50 animate-fadeIn">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-2 sm:p-4 border-b border-slate-200/50 bg-gradient-to-r from-white via-blue-50/40 to-white backdrop-blur-sm">
            <div className="flex items-center gap-1 sm:gap-3 flex-1 justify-center">
              <button
                onClick={navigatePrevious}
                disabled={isNavigating}
                className={`group p-1.5 sm:p-2.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg sm:rounded-xl transition-all duration-300 text-slate-700 hover:shadow-lg border border-transparent hover:border-[#005f82]/20 ${isNavigating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Période précédente"
              >
                {isNavigating ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-300 border-t-[#005f82] rounded-full animate-spin" />
                ) : (
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:-translate-x-1" />
                )}
              </button>
              <div className="text-center flex-1 px-2">
                <h2 className="text-sm sm:text-lg font-bold bg-gradient-to-r from-[#005f82] to-[#007ba8] bg-clip-text text-transparent capitalize">
                  {getDateRange}
                  {isNavigating && (
                    <span className="ml-2 text-xs text-slate-500 font-normal">Chargement...</span>
                  )}
                </h2>
              </div>
              <button
                onClick={navigateNext}
                disabled={isNavigating}
                className={`group p-1.5 sm:p-2.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg sm:rounded-xl transition-all duration-300 text-slate-700 hover:shadow-lg border border-transparent hover:border-[#005f82]/20 ${isNavigating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Période suivante"
              >
                {isNavigating ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-300 border-t-[#005f82] rounded-full animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 group-hover:text-[#005f82] transition-all duration-300 group-hover:translate-x-1" />
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
