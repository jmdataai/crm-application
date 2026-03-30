import React, { useState, useEffect } from 'react';
import { tasksAPI, formatApiError } from '../../services/api';
import { CheckCircle, Circle, Clock, Calendar, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { format } from 'date-fns';

const RecruitmentTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'today') params.due_today = true;
      if (filter === 'overdue') params.overdue = true;
      if (filter === 'completed') params.completed = true;
      if (filter === 'all') params.completed = false;
      
      const response = await tasksAPI.getAll(params);
      // Filter for recruitment-related tasks (with candidate_id)
      const recruitmentTasks = response.data?.filter(t => t.candidate_id || t.job_id) || [];
      setTasks(recruitmentTasks);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (taskId, currentStatus) => {
    try {
      await tasksAPI.update(taskId, { completed: !currentStatus });
      fetchTasks();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await tasksAPI.delete(taskId);
      fetchTasks();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const isOverdue = (dueDate) => dueDate && dueDate.split('T')[0] < today;

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="recruitment-tasks-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Recruitment Tasks</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, var(--tertiary) 0%, var(--tertiary-container) 100%)' }}
          data-testid="create-task-btn"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'all', label: 'Active' },
          { value: 'today', label: "Today's" },
          { value: 'overdue', label: 'Overdue' },
          { value: 'completed', label: 'Completed' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === tab.value 
                ? 'surface-container-lowest ambient-shadow' 
                : 'hover:bg-gray-100'
            }`}
            style={{ color: filter === tab.value ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Tasks List */}
      <div className="card-widget">
        {loading ? (
          <div className="py-12 text-center">
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
            <p className="title-sm mb-2">No tasks found</p>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
              Create recruitment tasks from candidate or job pages
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div 
                key={task.id}
                className={`flex items-center gap-4 p-4 rounded-lg transition-all ${task.completed ? 'opacity-60' : ''}`}
                style={{ 
                  backgroundColor: isOverdue(task.due_date) && !task.completed
                    ? 'rgba(220, 38, 38, 0.05)' 
                    : 'var(--surface-container-low)'
                }}
              >
                <button
                  onClick={() => toggleComplete(task.id, task.completed)}
                  className="flex-shrink-0"
                >
                  {task.completed ? (
                    <CheckCircle className="w-6 h-6" style={{ color: 'var(--tertiary)' }} />
                  ) : (
                    <Circle className="w-6 h-6" style={{ color: 'var(--on-surface-variant)' }} />
                  )}
                </button>
                
                <div className="flex-1 min-w-0">
                  <p className={`title-sm ${task.completed ? 'line-through' : ''}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="body-md mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="label-sm flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {task.due_date?.split('T')[0]}
                    </span>
                    <span className={`chip ${
                      task.priority === 'high' ? 'chip-error' : 
                      task.priority === 'medium' ? 'chip-pending' : 'chip-default'
                    }`}>
                      {task.priority}
                    </span>
                    {isOverdue(task.due_date) && !task.completed && (
                      <span className="chip chip-error">Overdue</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  className="p-2 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" style={{ color: 'var(--error)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal 
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); fetchTasks(); }}
      />
    </div>
  );
};

const CreateTaskModal = ({ open, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create as a generic task (will be filtered out of recruitment view unless linked to candidate)
      await tasksAPI.create({ title, description, due_date: dueDate, priority });
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('medium');
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-sm block mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label-sm block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[80px]"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm block mb-1">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input-field"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RecruitmentTasks;
