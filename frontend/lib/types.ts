export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface CalendarShare {
  id: number;
  user: { id: number; username: string };
  permission: 'read' | 'write';
}

export interface CalendarSource {
  id: number;
  user: { id: number; username: string };
  name: string;
  calendar_url: string;
  is_enabled: boolean;
  color: string;
  created_at: string;
  updated_at: string;
  shares: CalendarShare[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  is_completed: boolean;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
  caldav_uid?: string;
  caldav_etag?: string;
  last_synced?: string;
  calendar_source?: number;
  calendar_source_name?: string;
  calendar_source_color?: string;
}

export interface CalDAVConfig {
  id: number;
  username: string;
  calendar_name: string;
  sync_enabled: boolean;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
  calendars?: CalendarSource[];
}

export interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}

export type ViewMode = 'day' | 'week' | 'month';



