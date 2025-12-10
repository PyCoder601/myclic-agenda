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
}

const initialState: CalendarState = {
    calendars: [],
    events: [],
    loading: false,
    eventsLoading: false,
    error: null,
    lastFetch: null,
    optimisticEvents: {},
};

// Thunks

// Récupérer les calendriers
export const fetchCalendars = createAsyncThunk(
    'calendar/fetchCalendars',
    async (_, {rejectWithValue}) => {
        try {
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
    async (params: { start_date: string; end_date: string }, {rejectWithValue}) => {
        try {
            const response = await baikalAPI.getEvents(params);
            return response.data;
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

            // ✅ FUSION INTELLIGENTE au lieu de remplacement
            const newEvents = action.payload;

            // Créer un Map des événements existants pour accès rapide
            const existingEventsMap = new Map(state.events.map(e => [e.id, e]));

            // Ajouter/Mettre à jour les nouveaux événements
            newEvents.forEach((newEvent: Task) => {
                existingEventsMap.set(newEvent.id, newEvent);
            });

            // Convertir le Map en array
            state.events = Array.from(existingEventsMap.values());
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

