export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
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
}

export interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}

export type ViewMode = 'day' | 'week' | 'month';

