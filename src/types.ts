export type Card = {
  id: string;
  title: string;
  createdAt: number;
};

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  cardId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: TaskPriority;
  createdAt: number;
};

export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  createdAt: number;
};
