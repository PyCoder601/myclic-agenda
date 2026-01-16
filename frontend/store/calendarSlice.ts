import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import {baikalAPI} from '@/lib/api';
import {Task, CalendarSource} from '@/lib/types';

interface DateRange {
    start: string;
    end: string;
}

interface CalendarState {
    calendars: CalendarSource[];
    events: Task[]; // TOUS les événements accumulés (cache global)
    allCalendars: CalendarSource[]; // TOUS les calendriers (même display == 0)
    allEvents: Task[]; // TOUS les événements de tous les calendriers
    loadedRanges: DateRange[]; // Plages de dates déjà chargées pour éviter les fetches (mode personnel)
    groupLoadedRanges: DateRange[]; // Plages de dates déjà chargées pour le mode groupe
    loading: boolean;
    eventsLoading: boolean;
    groupEventsLoading: boolean; // État de chargement spécifique pour les événements du mode groupe
    allCalendarsLoaded: boolean; // Indique si tous les calendriers ont été chargés
    allEventsLoaded: boolean; // Indique si tous les événements ont été chargés
    error: string | null;
    lastFetch: number | null;
    optimisticEvents: { [key: string]: Task }; // Événements en attente de confirmation
}

const initialState: CalendarState = {
    calendars: [],
    events: [],
    allCalendars: [],
    allEvents: [],
    loadedRanges: [],
    groupLoadedRanges: [],
    loading: false,
    eventsLoading: false,
    groupEventsLoading: false,
    allCalendarsLoaded: false,
    allEventsLoaded: false,
    error: null,
    lastFetch: null,
    optimisticEvents: {},
};

// Helper function pour vérifier si une plage de dates est déjà chargée
const isRangeLoaded = (ranges: DateRange[], start: string, end: string): boolean => {
    return ranges.some(range => {
        // Vérifier si la plage demandée est couverte par une plage existante
        return range.start <= start && range.end >= end;
    });
};

// Helper function pour fusionner les plages de dates adjacentes ou qui se chevauchent
const mergeRanges = (ranges: DateRange[], newRange: DateRange): DateRange[] => {
    const allRanges = [...ranges, newRange];

    // Trier par date de début
    allRanges.sort((a, b) => a.start.localeCompare(b.start));

    // Fusionner les plages qui se chevauchent ou sont adjacentes
    const merged: DateRange[] = [];
    let current = allRanges[0];

    for (let i = 1; i < allRanges.length; i++) {
        const next = allRanges[i];

        if (current.end >= next.start) {
            // Chevauchement ou adjacent - fusionner
            current = {
                start: current.start,
                end: current.end > next.end ? current.end : next.end
            };
        } else {
            // Pas de chevauchement - ajouter current et passer au suivant
            merged.push(current);
            current = next;
        }
    }

    merged.push(current);
    return merged;
};

// Thunks

// Récupérer les calendriers (display != 0)
export const fetchCalendars = createAsyncThunk(
    'calendar/fetchCalendars',
    async (_forceRefresh: boolean = false, {rejectWithValue}) => {
        try {
            console.log('🔄 Fetch calendriers depuis l\'API');
            const response = await baikalAPI.getCalendars();
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la récupération des calendriers');
        }
    }
);

// Récupérer TOUS les calendriers (même display == 0) en arrière-plan
export const fetchAllCalendars = createAsyncThunk(
    'calendar/fetchAllCalendars',
    async (_, {rejectWithValue}) => {
        try {
            console.log('🔄 [Arrière-plan] Fetch TOUS les calendriers (même display == 0)');
            const response = await baikalAPI.getCalendars();
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la récupération de tous les calendriers');
        }
    }
);

// Récupérer les événements avec cache intelligent
export const fetchEvents = createAsyncThunk(
    'calendar/fetchEvents',
    async (params: { start_date: string; end_date: string; forceRefresh?: boolean }, {rejectWithValue, getState}) => {
        try {
            const state = getState() as { calendar: CalendarState };

            // Vérifier si cette plage est déjà chargée (sauf si forceRefresh)
            if (!params.forceRefresh && isRangeLoaded(state.calendar.loadedRanges, params.start_date, params.end_date)) {
                console.log(`✅ [Cache] Événements déjà en cache pour ${params.start_date} à ${params.end_date}`);
                return { data: [], fromCache: true, range: { start: params.start_date, end: params.end_date } };
            }

            console.log(`🔄 [Fetch] Événements pour ${params.start_date} à ${params.end_date}`);
            const response = await baikalAPI.getEvents({
                start_date: params.start_date,
                end_date: params.end_date
            });

            return { data: response.data, fromCache: false, range: { start: params.start_date, end: params.end_date } };
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la récupération des événements');
        }
    }
);

// Récupérer TOUS les événements de TOUS les calendriers (pour le mode groupe)
export const fetchAllGroupEvents = createAsyncThunk(
    'calendar/fetchAllGroupEvents',
    async (params: { start_date: string; end_date: string }, {rejectWithValue, getState}) => {
        try {
            const state = getState() as { calendar: CalendarState };

            // Vérifier si la plage est déjà chargée
            if (isRangeLoaded(state.calendar.groupLoadedRanges, params.start_date, params.end_date)) {
                console.log(`✅ [Cache] Événements de groupe déjà en cache pour ${params.start_date} à ${params.end_date}`);
                return { fromCache: true, events: [] }; // Retourner un indicateur de cache
            }

            console.log(`🔄 Fetch TOUS les événements de groupe pour ${params.start_date} à ${params.end_date}`);
            const response = await baikalAPI.getEvents({
                start_date: params.start_date,
                end_date: params.end_date,
                include_all: true  // ✅ Récupérer TOUS les calendriers sans filtre display
            });

            return {
                fromCache: false,
                events: response.data,
                dateRange: { start: params.start_date, end: params.end_date }
            };
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la récupération des événements de groupe');
        }
    }
);

// Récupérer TOUS les événements en arrière-plan (même display == 0)
export const fetchAllEventsBackground = createAsyncThunk(
    'calendar/fetchAllEventsBackground',
    async (params: { start_date: string; end_date: string }, {rejectWithValue}) => {
        try {
            console.log(`🔄 [Arrière-plan] Fetch TOUS les événements (même display == 0) pour ${params.start_date} à ${params.end_date}`);
            const response = await baikalAPI.getEvents({
                start_date: params.start_date,
                end_date: params.end_date,
                include_all: true  // ✅ Récupérer TOUS les calendriers sans filtre display
            });

            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la récupération de tous les événements');
        }
    }
);

// Créer un événement avec optimistic update
export const createEvent = createAsyncThunk(
    'calendar/createEvent',
    async (eventData: Partial<Task>, {rejectWithValue, dispatch}) => {
        // Générer un ID temporaire pour l'optimistic update
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Créer un événement optimiste immédiatement
        const optimisticEvent: Task = {
            id: tempId,
            title: eventData.title || 'Sans titre',
            description: eventData.description || '',
            start_date: eventData.start_date!,
            end_date: eventData.end_date!,
            calendar_source_id: eventData.calendar_source_id || 1,
            calendar_source_uri: eventData.calendar_source_uri || eventData.calendar_source_id || 1,
            calendar_source_name: eventData.calendar_source_name,
            calendar_source_color: eventData.calendar_source_color,
            lastmodified: Date.now(),
        };

        // Ajouter immédiatement l'événement optimiste
        dispatch(addOptimisticEvent({tempId, event: optimisticEvent}));

        try {
            console.log(eventData);
            // Envoyer la requête au backend
            const response = await baikalAPI.createEvent(eventData);

            // Retourner l'événement réel du serveur avec l'ID temporaire pour le mapping
            return {tempId, serverEvent: response.data};
        } catch (error: unknown) {
            // En cas d'erreur, supprimer l'événement optimiste
            dispatch(removeOptimisticEvent(tempId));
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la création de l\'événement');
        }
    }
);

// Mettre à jour un événement
export const updateEvent = createAsyncThunk(
    'calendar/updateEvent',
    async ({id, data}: { id: string; data: Partial<Task> }, {rejectWithValue, getState}) => {
        try {
            // ✅ Récupérer l'événement existant pour obtenir son URL
            const state = getState() as { calendar: CalendarState };
            const existingEvent = state.calendar.events.find(e => e.id === id);

            // ✅ Inclure l'URL dans les données envoyées
            const dataWithUrl = {
                ...data,
                url: existingEvent?.url || data.url
            };

            const response = await baikalAPI.updateEvent(id, dataWithUrl);
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la mise à jour de l\'événement');
        }
    }
);

// Supprimer un événement
export const deleteEvent = createAsyncThunk(
    'calendar/deleteEvent',
    async ({url, id, recurrenceId} : { url: string; id: string, recurrenceId?: string }, {rejectWithValue}) => {
        try {
            await baikalAPI.deleteEvent(url, id, recurrenceId);
            if (recurrenceId) {
                return { url, recurrenceId};
            }
            return { url};
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la suppression de l\'événement');
        }
    }
);

// Mettre à jour un calendrier
export const updateCalendar = createAsyncThunk(
    'calendar/updateCalendar',
    async ({id, data}: { id: number; data: Partial<CalendarSource> }, {rejectWithValue}) => {
        try {
            const response = await baikalAPI.updateCalendar(id, data);
            return response.data;
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } };
            return rejectWithValue(err.response?.data || 'Erreur lors de la mise à jour du calendrier');
        }
    }
);

const calendarSlice = createSlice({
    name: 'calendar',
    initialState,
    reducers: {
        // Actions synchrones
        addOptimisticEvent: (state, action: PayloadAction<{ tempId: string; event: Task }>) => {
            const {tempId, event} = action.payload;
            state.optimisticEvents[tempId] = event;
            // Ajouter aussi dans la liste des événements pour affichage immédiat
            state.events.push(event);
        },

        // Ajouter plusieurs événements d'un coup (bulk)
        addBulkEvents: (state, action: PayloadAction<Task[]>) => {
            const newEvents = action.payload;
            // Ajouter tous les nouveaux événements
            state.events.push(...newEvents);
        },

        removeOptimisticEvent: (state, action: PayloadAction<string>) => {
            const tempId = action.payload;
            delete state.optimisticEvents[tempId];
            // Retirer de la liste des événements
            state.events = state.events.filter(e => e.id !== tempId);
        },

        // Mise à jour optimiste pour les modifications
        optimisticUpdateEvent: (state, action: PayloadAction<{ id: string; data: Partial<Task> }>) => {
            const {id, data} = action.payload;
            const index = state.events.findIndex(e => e.id === id);
            if (index !== -1) {
                state.events[index] = {...state.events[index], ...data};
            }
        },

        // Suppression optimiste
        optimisticDeleteEvent: (state, action: PayloadAction<string>) => {
            state.events = state.events.filter(e => e.url !== action.payload);
        },

        toggleCalendarEnabled: (state, action: PayloadAction<number>) => {
            const calendarId = action.payload;
            state.calendars = state.calendars.map(cal => {
                if (cal.id === calendarId) {
                    return {
                        ...cal,
                        display: !cal.display,
                    };
                }
                return cal;
            });
            // Aussi mettre à jour allCalendars
            state.allCalendars = state.allCalendars.map(cal => {
                if (cal.id === calendarId) {
                    return {
                        ...cal,
                        display: !cal.display,
                    };
                }
                return cal;
            });
        },

        // Activer/désactiver les calendriers selon le mode de vue
        setCalendarsEnabledByMode: (state, action: PayloadAction<'personal' | 'group'>) => {
            const mode = action.payload;
            state.calendars = state.calendars.map(cal => {
                if (mode === 'group') {
                    // En mode groupe, activer tous les calendriers visibles par défaut
                    return {
                        ...cal,
                        display: true
                    };
                }

                return cal
            });
            // Aussi mettre à jour allCalendars
            state.allCalendars = state.allCalendars.map(cal => {

                if (mode === 'group') {
                    // En mode groupe, activer tous les calendriers visibles par défaut
                    return {
                        ...cal,
                        display: true
                    };
                }

               return cal
            });
        },
    },
    extraReducers: (builder) => {
        // Fetch calendriers
        builder.addCase(fetchCalendars.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchCalendars.fulfilled, (state, action) => {
            state.loading = false;
            state.calendars = action.payload as CalendarSource[];
        });
        builder.addCase(fetchCalendars.rejected, (state, action) => {
            state.loading = false;
            state.error = action.payload as string;
        });

        // Fetch événements
        builder.addCase(fetchEvents.pending, (state) => {
            state.eventsLoading = true;
            state.error = null;
        });
        builder.addCase(fetchEvents.fulfilled, (state, action) => {
            state.eventsLoading = false;

            const payload = action.payload as { data: Task[]; fromCache: boolean; range: { start: string; end: string } };

            // Si les données viennent du cache, ne rien faire
            if (payload.fromCache) {
                console.log(`✅ [Cache] Utilisation des données en cache`);
                return;
            }

            const newEvents = payload.data as Task[];
            const range = payload.range as DateRange;

            // AJOUTER les nouveaux événements sans supprimer les anciens
            // Filtrer les doublons basés sur l'ID
            const existingIds = new Set(state.events.map(e => e.id));
            const eventsToAdd = newEvents.filter(e => !existingIds.has(e.id));

            state.events = [...state.events, ...eventsToAdd];

            // Ajouter la plage aux plages chargées
            state.loadedRanges = mergeRanges(state.loadedRanges, range);

            state.lastFetch = Date.now();

            console.log(`✅ [Fetch] ${eventsToAdd.length} nouveaux événements ajoutés (total: ${state.events.length})`);
        });
        builder.addCase(fetchEvents.rejected, (state, action) => {
            state.eventsLoading = false;
            state.error = action.payload as string;
        });

        // Fetch TOUS les événements de groupe
        builder.addCase(fetchAllGroupEvents.pending, (state) => {
            state.groupEventsLoading = true;
            state.error = null;
        });
        builder.addCase(fetchAllGroupEvents.fulfilled, (state, action) => {
            state.groupEventsLoading = false;

            const payload = action.payload as { fromCache: boolean; events: Task[]; dateRange?: { start: string; end: string } };

            // Si les données viennent du cache, ne rien faire
            if (payload.fromCache) {
                console.log(`✅ [Cache] Utilisation du cache pour le mode groupe`);
                return;
            }

            // Accumuler les nouveaux événements au lieu de remplacer
            const newEvents = payload.events as Task[];
            const existingIds = new Set(state.allEvents.map(e => e.id));
            const eventsToAdd = newEvents.filter(event => !existingIds.has(event.id));

            state.allEvents = [...state.allEvents, ...eventsToAdd];
            state.lastFetch = Date.now();

            // Mettre à jour les plages chargées pour le mode groupe
            if (payload.dateRange) {
                state.groupLoadedRanges = mergeRanges(state.groupLoadedRanges, payload.dateRange);
                console.log(`✅ [Fetch] ${eventsToAdd.length} nouveaux événements de groupe ajoutés (total: ${state.allEvents.length})`);
                console.log(`📊 Plages groupe chargées:`, state.groupLoadedRanges);
            }
        });
        builder.addCase(fetchAllGroupEvents.rejected, (state, action) => {
            state.groupEventsLoading = false;
            state.error = action.payload as string;
        });

        // Fetch TOUS les calendriers en arrière-plan
        builder.addCase(fetchAllCalendars.fulfilled, (state, action) => {
            // Si calendars existe déjà, synchroniser les valeurs display
            if (state.calendars.length > 0) {
                const displayStates = new Map(
                    state.calendars.map(cal => [cal.id, cal.display])
                );

                state.allCalendars = (action.payload as CalendarSource[]).map((cal) => ({
                    ...cal,
                    display: displayStates.has(cal.id)
                        ? displayStates.get(cal.id)!
                        : !((cal.displayname || '').includes('(') || (cal.displayname || '').includes(')')),
                }));
            } else {
                // Initialisation par défaut
                state.allCalendars = (action.payload as CalendarSource[]).map((cal) => {
                    const calendarName = cal.displayname || '';
                    const hasParentheses = calendarName.includes('(') || calendarName.includes(')');

                    return {
                        ...cal,
                        display: !hasParentheses,
                    };
                });
            }
            state.allCalendarsLoaded = true;
            console.log(`✅ [Arrière-plan] ${state.allCalendars.length} calendriers chargés`);
        });

        // Fetch TOUS les événements en arrière-plan
        builder.addCase(fetchAllEventsBackground.fulfilled, (state, action) => {
            state.allEvents = action.payload as Task[];
            state.allEventsLoaded = true;
            console.log(`✅ [Arrière-plan] ${state.allEvents.length} événements chargés`);
        });

        // Create événement
        builder.addCase(createEvent.fulfilled, (state, action) => {
            const {tempId, serverEvent} = action.payload;

            // Supprimer l'événement optimiste
            delete state.optimisticEvents[tempId];

            // Remplacer l'événement temporaire par l'événement réel du serveur
            const index = state.events.findIndex(e => e.id === tempId);
            if (index !== -1) {
                state.events[index] = serverEvent;
            } else {
                // Si pas trouvé, l'ajouter au cache global
                state.events.push(serverEvent);
            }

            // Aussi ajouter à allEvents si chargé
            if (state.allEventsLoaded) {
                const allIndex = state.allEvents.findIndex(e => e.id === tempId);
                if (allIndex !== -1) {
                    state.allEvents[allIndex] = serverEvent;
                } else {
                    state.allEvents.push(serverEvent);
                }
            }
        });
        builder.addCase(createEvent.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Update événement
        builder.addCase(updateEvent.fulfilled, (state, action) => {
            const index = state.events.findIndex(e => e.id === action.payload.id);
            if (index !== -1) {
                // ✅ Fusionner avec les données existantes pour préserver tous les champs
                state.events[index] = { ...state.events[index], ...action.payload };
            }

            // Aussi mettre à jour dans allEvents si chargé
            if (state.allEventsLoaded) {
                const allIndex = state.allEvents.findIndex(e => e.id === action.payload.id);
                if (allIndex !== -1) {
                    // ✅ Fusionner avec les données existantes pour préserver tous les champs
                    state.allEvents[allIndex] = { ...state.allEvents[allIndex], ...action.payload };
                }
            }
        });
        builder.addCase(updateEvent.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Delete événement
        builder.addCase(deleteEvent.fulfilled, (state, action) => {
            // Le payload peut être soit { url: string } soit { url: string, recurrenceId: string }
            const payload = action.payload as { url: string; recurrenceId?: string } | { url: string };
            const url = payload.url;
            const recurrenceId = typeof payload === 'object' && 'recurrenceId' in payload ? payload.recurrenceId : null;

            if (recurrenceId) {
                // Suppression d'une occurrence spécifique - garder l'événement mais le marquer comme supprimé
                // Note: Le backend ajoute une EXDATE, donc l'occurrence ne reviendra plus lors du prochain fetch
                console.log(`🗑️ Occurrence supprimée: ${url} - ${recurrenceId}`);
                // On peut filtrer l'occurrence spécifique du store
                state.events = state.events.filter(e => !(e.url === url && e.recurrence_id === recurrenceId));
                if (state.allEventsLoaded) {
                    state.allEvents = state.allEvents.filter(e => !(e.url === url && e.recurrence_id === recurrenceId));
                }
            } else {
                // Suppression complète - supprimer toutes les occurrences avec cette URL
                console.log(`🗑️ Événement complet supprimé: ${url}`);
                state.events = state.events.filter(e => e.url !== url);
                if (state.allEventsLoaded) {
                    state.allEvents = state.allEvents.filter(e => e.url !== url);
                }
            }
        });
        builder.addCase(deleteEvent.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Update calendrier
        builder.addCase(updateCalendar.fulfilled, (state, action) => {
            const index = state.calendars.findIndex(c => c.id === action.payload.id);
            if (index !== -1) {
                state.calendars[index] = action.payload;
            }
        });
        builder.addCase(updateCalendar.rejected, (state, action) => {
            state.error = action.payload as string;
        });
    },
});

export const {
    addOptimisticEvent,
    addBulkEvents,
    removeOptimisticEvent,
    optimisticUpdateEvent,
    setCalendarsEnabledByMode,
    toggleCalendarEnabled
} = calendarSlice.actions;

export default calendarSlice.reducer;

