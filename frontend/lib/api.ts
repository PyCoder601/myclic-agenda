import axios from 'axios';
import {CalendarSource, Task} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Intercepteur pour ajouter le token JWT
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Intercepteur pour gérer le rafraîchissement du token
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('refresh_token');
                const response = await axios.post(`${API_URL}/auth/token/refresh/`, {
                    refresh: refreshToken,
                });

                const {access} = response.data;
                localStorage.setItem('access_token', access);

                originalRequest.headers.Authorization = `Bearer ${access}`;
                return api(originalRequest);
            } catch (refreshError) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

// ============================================================================
// API CalDAV (Ancienne API - Conservation pour compatibilité)
// ============================================================================
// ⚠️ NOTE: Cette API est conservée pour la configuration et les anciennes
// fonctionnalités. Pour les opérations CRUD sur les événements et calendriers,
// utilisez baikalAPI ci-dessous.
// ============================================================================
export const caldavAPI = {
    // Récupérer la configuration CalDAV
    getConfig: () => api.get('/caldav/config/'),

    // Créer ou mettre à jour la configuration CalDAV
    saveConfig: (data: {
        username: string;
        password: string;
        calendar_name?: string;
        sync_enabled?: boolean;
    }) => api.post('/caldav/config/', data),

    // Mettre à jour la configuration CalDAV
    updateConfig: (data: Partial<{
        username: string;
        password: string;
        calendar_name: string;
        sync_enabled: boolean;
    }>) => api.put('/caldav/config/', data),

    // Supprimer la configuration CalDAV
    deleteConfig: () => api.delete('/caldav/config/'),

    // Tester la connexion CalDAV
    testConnection: () => api.post('/caldav/test/'),

    // Synchroniser les tâches
    sync: () => api.post('/caldav/sync/'),

    // Synchroniser via le viewset des tâches
    syncTasks: () => api.post('/tasks/sync/'),

    // Découvrir tous les calendriers disponibles
    discoverCalendars: () => api.get('/caldav/discover/'),

    // Récupérer tous les calendriers (possédés et partagés)
    getAllCalendars: () => api.get('/caldav/calendars/all/'),

    // Récupérer les calendriers avec droit d'écriture
    getWritableCalendars: () => api.get('/caldav/calendars/writable/'),

    // Mettre à jour un calendrier (activer/désactiver, changer couleur, etc.)
    updateCalendar: (calendarId: number, data: Partial<{
        displayname: string;
        display: boolean;
        calendarcolor: string;
    }>) => api.put(`/caldav/calendars/${calendarId}/`, data),

    // Supprimer un calendrier
    deleteCalendar: (calendarId: number) => api.delete(`/caldav/calendars/${calendarId}/`),

    // Rechercher des utilisateurs
    searchUsers: (query: string) => api.get(`/users/search/?query=${query}`),

    // Partager un calendrier
    shareCalendar: (calendarId: number, userId: number, permission = 'read') =>
        api.post(`/caldav/calendars/${calendarId}/share/`, {user_id: userId, permission: permission}),

    // Révoquer le partage
    unshareCalendar: (calendarId: number, userId: number) =>
        api.delete(`/caldav/calendars/${calendarId}/share/`, {data: {user_id: userId}}),
};

// ============================================================================
// API Baikal (API Principale - Accès direct MySQL + CalDAV pour écritures)
// ============================================================================
// ✅ Architecture:
//    - Lectures: Directement depuis MySQL de Baikal (rapide, pas de locks)
//    - Écritures: Via CalDAV (évite les conflits de locks MySQL)
// ✅ Utilisation: Pour tous les CRUD sur événements et calendriers
// ============================================================================
export const baikalAPI = {
    // Récupérer les calendriers
    getCalendars: () => api.get('/baikal/calendars/'),

    // Récupérer un calendrier spécifique
    getCalendar: (calendarId: number) => api.get(`/baikal/calendars/${calendarId}/`),

    // Créer un calendrier
    createCalendar: (data: Partial<CalendarSource>) => api.post('/baikal/calendars/', data),

    // Mettre à jour un calendrier
    updateCalendar: (calendarId: number, data: Partial<CalendarSource>) =>
        api.patch(`/baikal/calendars/${calendarId}/`, data),

    getEvents: (params?: { start_date?: string; end_date?: string; include_all?: boolean }) =>
        api.get('/baikal/events/', {params}),

    // Récupérer un événement spécifique
    getEvent: (eventId: number) => api.get(`/baikal/events/${eventId}/`),

    // Créer un événement
    createEvent: (data: Partial<Task>) => api.post('/baikal/events/', data),

    // Mettre à jour un événement
    updateEvent: (eventId: number, data: Partial<Task>) => {
        console.log('📝 baikalAPI.updateEvent appelé:', { eventId, data });
        return api.patch(`/baikal/events/${eventId}/`, {
            ...data,
            url: data.url // ✅ Envoyer l'URL CalDAV pour la mise à jour
        });
    },

    // Supprimer un événement
    deleteEvent: (url: string, id: string) => {
        console.log("eventUrl dans api.ts:", url);
        // ✅ Envoyer l'URL dans le body de la requête DELETE
        console.log(url)
        return api.delete(`/baikal/events/${id}/`, {
            data: url ? { url: url } : {}
        });
    },

    // Rechercher des clients
    searchClients: (query: string) =>
        api.get('/search-clients/', { params: { q: query } }),

    // Rechercher des affaires liées à un client
    searchAffairs: (clientId: number, query?: string) =>
        api.get('/search-affairs/', {
            params: {
                client_id: clientId,
                ...(query && { q: query })
            }
        }),
};

export default api;
