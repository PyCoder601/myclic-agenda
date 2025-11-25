import axios from 'axios';

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

        const { access } = response.data;
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

// API CalDAV
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

  // Mettre à jour un calendrier (activer/désactiver, changer couleur, etc.)
  updateCalendar: (calendarId: number, data: Partial<{
    name: string;
    is_enabled: boolean;
    color: string;
  }>) => api.put(`/caldav/calendars/${calendarId}/`, data),

  // Supprimer un calendrier
  deleteCalendar: (calendarId: number) => api.delete(`/caldav/calendars/${calendarId}/`),

  // Rechercher des utilisateurs
  searchUsers: (query: string) => api.get(`/users/search/?query=${query}`),

  // Partager un calendrier
  shareCalendar: (calendarId: number, userId: number, permission = 'read') =>
    api.post(`/caldav/calendars/${calendarId}/share/`, { user_id: userId, permission: permission }),

  // Révoquer le partage
  unshareCalendar: (calendarId: number, userId: number) =>
    api.delete(`/caldav/calendars/${calendarId}/share/`, { data: { user_id: userId } }),
};

export default api;



