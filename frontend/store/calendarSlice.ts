import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import {baikalAPI} from '@/lib/api';
import {Task, CalendarSource} from '@/lib/types';

interface CalendarState {
    calendars: CalendarSource[];
    events: Task[];
    loading: boolean;
    eventsLoading: boolean;
    error: string | null;
    lastFetch: number | null;
    optimisticEvents: { [key: string]: Task }; // Événements en attente de confirmation
    // ✅ Cache intelligent
    cachedPeriods: { [key: string]: number }; // Clé: "start_end", Valeur: timestamp du fetch
    calendarsLastFetch: number | null; // Timestamp du dernier fetch des calendriers
    eventsByDate: { [key: string]: number[] }; // Index des événements par date
}

const initialState: CalendarState = {
    calendars: [],
    events: [],
    loading: false,
    eventsLoading: false,
    error: null,
    lastFetch: null,
    optimisticEvents: {},
    cachedPeriods: {},
    calendarsLastFetch: null,
    eventsByDate: {},
};

// Thunks

// Récupérer les calendriers
export const fetchCalendars = createAsyncThunk(
    'calendar/fetchCalendars',
    async (forceRefresh: boolean = false, {rejectWithValue, getState}) => {
        try {
            // ✅ Vérifier le cache (5 minutes)
            const state = getState() as { calendar: CalendarState };
            const now = Date.now();
            const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

            if (!forceRefresh &&
                state.calendar.calendarsLastFetch &&
                state.calendar.calendars.length > 0 &&
                (now - state.calendar.calendarsLastFetch) < CACHE_DURATION) {
                console.log('✅ Calendriers déjà en cache, pas de requête');
                return state.calendar.calendars; // Retourner depuis le cache
            }

            console.log('🔄 Fetch calendriers depuis l\'API');
            const response = await baikalAPI.getCalendars();
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Erreur lors de la récupération des calendriers');
        }
    }
);

// Récupérer les événements
export const fetchEvents = createAsyncThunk(
    'calendar/fetchEvents',
    async (params: { start_date: string; end_date: string; forceRefresh?: boolean }, {rejectWithValue, getState}) => {
        try {
            // ✅ Vérifier le cache par période (2 minutes)
            const state = getState() as { calendar: CalendarState };
            const now = Date.now();
            const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
            const periodKey = `${params.start_date}_${params.end_date}`;

            if (!params.forceRefresh && state.calendar.cachedPeriods[periodKey]) {
                const lastFetch = state.calendar.cachedPeriods[periodKey];
                if ((now - lastFetch) < CACHE_DURATION) {
                    console.log(`✅ Période ${periodKey} déjà en cache, pas de requête`);
                    // Retourner les événements existants pour cette période
                    return {
                        events: state.calendar.events,
                        periodKey,
                        fromCache: true
                    };
                }
            }

            console.log(`🔄 Fetch événements pour ${periodKey}`);
            const response = await baikalAPI.getEvents({
                start_date: params.start_date,
                end_date: params.end_date
            });

            return {
                events: response.data,
                periodKey,
                fromCache: false
            };
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Erreur lors de la récupération des événements');
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
            id: tempId as any,
            title: eventData.title || 'Sans titre',
            description: eventData.description || '',
            start_date: eventData.start_date!,
            end_date: eventData.end_date!,
            is_completed: eventData.is_completed || false,
            calendar_id: eventData.calendar_id,
            calendar_source: eventData.calendar_source,
            calendar_source_name: eventData.calendar_source_name,
            calendar_source_color: eventData.calendar_source_color,
            uid: tempId,
            etag: '',
            uri: '',
            lastmodified: Date.now(),
        };

        // Ajouter immédiatement l'événement optimiste
        dispatch(addOptimisticEvent({tempId, event: optimisticEvent}));

        try {
            // Envoyer la requête au backend
            const response = await baikalAPI.createEvent(eventData);

            // Retourner l'événement réel du serveur avec l'ID temporaire pour le mapping
            return {tempId, serverEvent: response.data};
        } catch (error: any) {
            // En cas d'erreur, supprimer l'événement optimiste
            dispatch(removeOptimisticEvent(tempId));
            return rejectWithValue(error.response?.data || 'Erreur lors de la création de l\'événement');
        }
    }
);

// Mettre à jour un événement
export const updateEvent = createAsyncThunk(
    'calendar/updateEvent',
    async ({id, data}: { id: number; data: Partial<Task> }, {rejectWithValue, getState}) => {
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
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Erreur lors de la mise à jour de l\'événement');
        }
    }
);

// Supprimer un événement
export const deleteEvent = createAsyncThunk(
    'calendar/deleteEvent',
    async (id: number, {rejectWithValue, getState}) => {
        try {
            // ✅ Récupérer l'événement existant pour obtenir son URL
            const state = getState() as { calendar: CalendarState };
            const existingEvent = state.calendar.events.find(e => e.id === id);

            await baikalAPI.deleteEvent(id, existingEvent?.url);
            return id;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Erreur lors de la suppression de l\'événement');
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
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Erreur lors de la mise à jour du calendrier');
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

        removeOptimisticEvent: (state, action: PayloadAction<string>) => {
            const tempId = action.payload;
            delete state.optimisticEvents[tempId];
            // Retirer de la liste des événements
            state.events = state.events.filter(e => e.id !== tempId as any);
        },

        clearError: (state) => {
            state.error = null;
        },

        // Mise à jour optimiste pour les modifications
        optimisticUpdateEvent: (state, action: PayloadAction<{ id: number; data: Partial<Task> }>) => {
            const {id, data} = action.payload;
            const index = state.events.findIndex(e => e.id === id);
            if (index !== -1) {
                state.events[index] = {...state.events[index], ...data};
            }
        },

        // Suppression optimiste
        optimisticDeleteEvent: (state, action: PayloadAction<number>) => {
            state.events = state.events.filter(e => e.id !== action.payload);
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
            state.calendars = action.payload;
            state.calendarsLastFetch = Date.now(); // ✅ Timestamp du cache
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

            // ✅ Gestion intelligente du cache
            if (action.payload.fromCache) {
                // Déjà en cache, pas de changement
                console.log('✅ Événements depuis le cache');
            } else {
                // Nouveaux événements depuis l'API
                const newEvents = action.payload.events;

                // Fusionner les événements sans doublons (par ID)
                const existingIds = new Set(state.events.map(e => e.id));
                const eventsToAdd = newEvents.filter((e: Task) => !existingIds.has(e.id));

                state.events = [...state.events, ...eventsToAdd];

                // Mettre à jour le cache de la période
                state.cachedPeriods[action.payload.periodKey] = Date.now();

                console.log(`✅ ${eventsToAdd.length} nouveaux événements ajoutés, total: ${state.events.length}`);
            }

            state.lastFetch = Date.now();
        });
        builder.addCase(fetchEvents.rejected, (state, action) => {
            state.eventsLoading = false;
            state.error = action.payload as string;
        });

        // Create événement
        builder.addCase(createEvent.fulfilled, (state, action) => {
            const {tempId, serverEvent} = action.payload;

            // Supprimer l'événement optimiste
            delete state.optimisticEvents[tempId];

            // Remplacer l'événement temporaire par l'événement réel du serveur
            const index = state.events.findIndex(e => e.id === tempId as any);
            if (index !== -1) {
                state.events[index] = serverEvent;
            } else {
                // Si pas trouvé, l'ajouter
                state.events.push(serverEvent);
            }
        });
        builder.addCase(createEvent.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Update événement
        builder.addCase(updateEvent.fulfilled, (state, action) => {
            const index = state.events.findIndex(e => e.id === action.payload.id);
            if (index !== -1) {
                state.events[index] = action.payload;
            }
        });
        builder.addCase(updateEvent.rejected, (state, action) => {
            state.error = action.payload as string;
        });

        // Delete événement
        builder.addCase(deleteEvent.fulfilled, (state, action) => {
            state.events = state.events.filter(e => e.id !== action.payload);
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
    removeOptimisticEvent,
    clearError,
    optimisticUpdateEvent,
    optimisticDeleteEvent,
} = calendarSlice.actions;

export default calendarSlice.reducer;

