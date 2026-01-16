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

    // Créer plusieurs événements en bulk (pour les récurrences)
    bulkCreateEvents: (data: {
        events: Array<{
            title: string;
            description: string;
            location?: string;
            start_date: string;
            end_date: string;
            recurrence_id?: string;
        }>;
        calendar_source_name: string;
        calendar_source_color: string;
        calendar_source_uri: string;
        calendar_source_id: number;
        client_id?: number;
        affair_id?: number;
        sequence: number;
    }) => api.post('/baikal/events/bulk_create/', data),

    // Mettre à jour un événement
    updateEvent: (eventId: string, data: Partial<Task>) => {
        console.log('📝 baikalAPI.updateEvent appelé:', { eventId, data });
        return api.patch(`/baikal/events/${eventId}/`, {
            ...data,
            url: data.url // ✅ Envoyer l'URL CalDAV pour la mise à jour
        });
    },

    // Supprimer un événement
    deleteEvent: (url: string, id: string, recurrenceId: string | undefined) => {
        console.log("eventUrl dans api.ts:", url);

        const cleanUrl = url;

        console.log("Clean URL:", cleanUrl);
        console.log("Recurrence ID:", recurrenceId);

        // ✅ Envoyer l'URL et le recurrence_id dans le body de la requête DELETE
        return api.delete(`/baikal/events/${id}/`, {
            data: {
                url: cleanUrl,
                ...(recurrenceId && { recurrence_id: recurrenceId })
            }
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

    // Récupérer les informations du client et de l'affaire par leurs IDs
    getClientAffairInfo: (clientId?: number, affairId?: number) =>
        api.get('/client-affair-info/', {
            params: {
                ...(clientId && { client_id: clientId }),
                ...(affairId && { affair_id: affairId })
            }
        }),
};

export default api;
