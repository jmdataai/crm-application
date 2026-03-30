import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI, formatApiError } from '../../services/api';
import { 
  Users, UserCheck, Phone, Star, X, Clock, ArrowUpRight, 
  Calendar, Bell, TrendingUp, CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';

const statusColors = {
  new: 'chip-primary',
  contacted: 'chip-default',
  called: 'chip-default',
  interested: 'chip-pending',
  closed: 'chip-success',
  completed: 'chip-success',
  rejected: 'chip-error',
  lost: 'chip-error',
  follow_up_needed: 'chip-pending'
};

const SalesDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await dashboardAPI.getSales();
      setData(response.data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--primary)' }}></div>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--error-container)' }}>
        <p style={{ color: 'var(--error)' }}>{error}</p>
      </div>
    );
  }

  const { lead_stats, total_leads, today_tasks, overdue_tasks, today_followups, recent_leads, reminders } = data || {};

  return (
    <div className="animate-fadeIn" data-testid="sales-dashboard">
      {/* Header */}
      <div className="mb-8">
        <h1 className="headline-sm mb-2" style={{ color: 'var(--on-surface)' }}>Sales Dashboard</h1>
        <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats Row - Asymmetric Layout */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Big Number - Total Leads */}
        <div className="col-span-4 card-widget" data-testid="total-leads-card">
          <p className="label-sm mb-2">TOTAL LEADS</p>
          <p className="display-lg" style={{ color: 'var(--primary)' }}>{total_leads || 0}</p>
          <div className="flex items-center gap-2 mt-4">
            <TrendingUp className="w-4 h-4" style={{ color: 'var(--tertiary)' }} />
            <span className="body-md" style={{ color: 'var(--tertiary)' }}>Active pipeline</span>
          </div>
        </div>

        {/* Status Grid */}
        <div className="col-span-8 card-widget">
          <p className="label-sm mb-4">LEAD STATUS BREAKDOWN</p>
          <div className="grid grid-cols-4 gap-4">
            <StatusCard icon={Users} label="New" value={lead_stats?.new || 0} color="var(--primary)" />
            <StatusCard icon={Phone} label="Contacted" value={lead_stats?.contacted || 0} color="var(--on-surface-variant)" />
            <StatusCard icon={Star} label="Interested" value={lead_stats?.interested || 0} color="var(--amber)" />
            <StatusCard icon={CheckCircle} label="Completed" value={lead_stats?.completed || 0} color="var(--tertiary)" />
          </div>
        </div>
      </div>

      {/* Main Content - 70/30 Split */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left - Today's Tasks & Follow-ups (70%) */}
        <div className="col-span-8 space-y-6">
          {/* Today's Tasks */}
          <div className="card-widget" data-testid="today-tasks-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Today's Tasks</h2>
              <Link to="/sales/tasks" className="body-md flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                View all <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
            {today_tasks?.length > 0 ? (
              <div className="space-y-3">
                {today_tasks.slice(0, 5).map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No tasks due today
              </p>
            )}
          </div>

          {/* Overdue Tasks */}
          {overdue_tasks?.length > 0 && (
            <div className="card-widget" style={{ borderLeft: '3px solid var(--error)' }} data-testid="overdue-tasks-section">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" style={{ color: 'var(--error)' }} />
                <h2 className="title-sm" style={{ color: 'var(--error)' }}>Overdue Tasks</h2>
              </div>
              <div className="space-y-3">
                {overdue_tasks.slice(0, 3).map((task) => (
                  <TaskItem key={task.id} task={task} isOverdue />
                ))}
              </div>
            </div>
          )}

          {/* Today's Follow-ups */}
          <div className="card-widget" data-testid="followups-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Today's Follow-ups</h2>
              <span className="chip chip-pending">{today_followups?.length || 0}</span>
            </div>
            {today_followups?.length > 0 ? (
              <div className="space-y-3">
                {today_followups.slice(0, 5).map((lead) => (
                  <Link 
                    key={lead.id} 
                    to={`/sales/leads/${lead.id}`}
                    className="block p-3 rounded-lg transition-all hover:shadow-md"
                    style={{ backgroundColor: 'var(--surface-container-low)' }}
                  >
                    <p className="title-sm">{lead.full_name}</p>
                    <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>{lead.company || 'No company'}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No follow-ups scheduled for today
              </p>
            )}
          </div>
        </div>

        {/* Right - Recent Activity & Reminders (30%) */}
        <div className="col-span-4 space-y-6">
          {/* Reminders */}
          <div className="card-widget" data-testid="reminders-section">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h2 className="title-sm">Upcoming Reminders</h2>
            </div>
            {reminders?.length > 0 ? (
              <div className="space-y-3">
                {reminders.slice(0, 5).map((reminder) => (
                  <div key={reminder.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                    <p className="title-sm">{reminder.title}</p>
                    <p className="label-sm mt-1">
                      <Calendar className="w-3 h-3 inline-block mr-1" />
                      {reminder.due_date?.split('T')[0]}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md py-4 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No upcoming reminders
              </p>
            )}
          </div>

          {/* Recent Leads */}
          <div className="card-widget" data-testid="recent-leads-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Recent Leads</h2>
              <Link to="/sales/leads" className="body-md" style={{ color: 'var(--primary)' }}>
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {recent_leads?.slice(0, 6).map((lead) => (
                <Link 
                  key={lead.id} 
                  to={`/sales/leads/${lead.id}`}
                  className="flex items-center justify-between p-2 rounded-lg transition-all hover:bg-opacity-50"
                  style={{ backgroundColor: 'var(--surface-container-low)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="title-sm truncate">{lead.full_name}</p>
                    <p className="label-sm truncate">{lead.company || 'No company'}</p>
                  </div>
                  <span className={`chip ${statusColors[lead.status] || 'chip-default'}`}>
                    {lead.status?.replace('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusCard = ({ icon: Icon, label, value, color }) => (
  <div className="text-center p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
    <Icon className="w-6 h-6 mx-auto mb-2" style={{ color }} />
    <p className="headline-sm" style={{ color }}>{value}</p>
    <p className="label-sm mt-1">{label}</p>
  </div>
);

const TaskItem = ({ task, isOverdue }) => (
  <div 
    className="flex items-center justify-between p-3 rounded-lg"
    style={{ backgroundColor: isOverdue ? 'rgba(220, 38, 38, 0.05)' : 'var(--surface-container-low)' }}
  >
    <div className="flex items-center gap-3">
      <div 
        className="w-2 h-2 rounded-full"
        style={{ 
          backgroundColor: task.priority === 'high' ? 'var(--error)' : 
                          task.priority === 'medium' ? 'var(--amber)' : 'var(--on-surface-variant)'
        }}
      />
      <div>
        <p className="title-sm">{task.title}</p>
        <p className="label-sm">{task.due_date?.split('T')[0]}</p>
      </div>
    </div>
    <span className={`chip ${task.priority === 'high' ? 'chip-error' : task.priority === 'medium' ? 'chip-pending' : 'chip-default'}`}>
      {task.priority}
    </span>
  </div>
);

export default SalesDashboard;
