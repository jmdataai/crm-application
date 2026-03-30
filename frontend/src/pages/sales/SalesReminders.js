import React, { useState, useEffect } from 'react';
import { remindersAPI, formatApiError } from '../../services/api';
import { Bell, Calendar, Plus, Trash2, Mail, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { format } from 'date-fns';

const SalesReminders = () => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const response = await remindersAPI.getAll({ upcoming: true });
      setReminders(response.data || []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const deleteReminder = async (id) => {
    try {
      await remindersAPI.delete(id);
      fetchReminders();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const sendReminderEmail = async (id) => {
    try {
      await remindersAPI.sendEmail(id);
      fetchReminders();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const isToday = (date) => date?.split('T')[0] === today;
  const isPast = (date) => date?.split('T')[0] < today;

  return (
    <div className="animate-fadeIn" data-testid="sales-reminders-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Reminders</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Never miss an important follow-up
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary flex items-center gap-2"
          data-testid="create-reminder-btn"
        >
          <Plus className="w-4 h-4" />
          New Reminder
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Reminders Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Today's Reminders */}
        <div className="col-span-6">
          <div className="card-widget">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h2 className="title-sm">Today</h2>
            </div>
            {loading ? (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>Loading...</p>
            ) : (
              <div className="space-y-3">
                {reminders.filter(r => isToday(r.due_date)).length > 0 ? (
                  reminders.filter(r => isToday(r.due_date)).map(reminder => (
                    <ReminderCard 
                      key={reminder.id} 
                      reminder={reminder} 
                      onDelete={deleteReminder}
                      onSendEmail={sendReminderEmail}
                      highlight
                    />
                  ))
                ) : (
                  <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                    No reminders for today
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Reminders */}
        <div className="col-span-6">
          <div className="card-widget">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
              <h2 className="title-sm">Upcoming</h2>
            </div>
            {loading ? (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>Loading...</p>
            ) : (
              <div className="space-y-3">
                {reminders.filter(r => !isToday(r.due_date) && !isPast(r.due_date)).length > 0 ? (
                  reminders.filter(r => !isToday(r.due_date) && !isPast(r.due_date)).map(reminder => (
                    <ReminderCard 
                      key={reminder.id} 
                      reminder={reminder} 
                      onDelete={deleteReminder}
                      onSendEmail={sendReminderEmail}
                    />
                  ))
                ) : (
                  <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                    No upcoming reminders
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <CreateReminderModal 
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); fetchReminders(); }}
      />
    </div>
  );
};

const ReminderCard = ({ reminder, onDelete, onSendEmail, highlight }) => (
  <div 
    className="p-4 rounded-lg"
    style={{ 
      backgroundColor: highlight ? 'rgba(0, 74, 198, 0.05)' : 'var(--surface-container-low)',
      borderLeft: highlight ? '3px solid var(--primary)' : 'none'
    }}
    data-testid={`reminder-${reminder.id}`}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="title-sm">{reminder.title}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="label-sm flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {reminder.due_date?.split('T')[0]}
          </span>
          {reminder.send_email && (
            <span className="chip chip-default flex items-center gap-1">
              <Mail className="w-3 h-3" />
              Email
            </span>
          )}
          {reminder.sent && (
            <span className="chip chip-success">Sent</span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {reminder.send_email && !reminder.sent && (
          <button
            onClick={() => onSendEmail(reminder.id)}
            className="p-2 rounded-lg hover:bg-blue-50"
            title="Send email now"
          >
            <Mail className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          </button>
        )}
        <button
          onClick={() => onDelete(reminder.id)}
          className="p-2 rounded-lg hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" style={{ color: 'var(--error)' }} />
        </button>
      </div>
    </div>
  </div>
);

const CreateReminderModal = ({ open, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await remindersAPI.create({ title, due_date: dueDate, send_email: sendEmail });
      setTitle('');
      setDueDate('');
      setSendEmail(false);
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
          <DialogTitle>Create Reminder</DialogTitle>
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
              data-testid="reminder-title-input"
            />
          </div>
          <div>
            <label className="label-sm block mb-1">Due Date *</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input-field"
              required
              data-testid="reminder-due-date-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="sendEmail" 
              checked={sendEmail} 
              onChange={(e) => setSendEmail(e.target.checked)} 
            />
            <label htmlFor="sendEmail" className="body-md">Send email reminder</label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="submit-reminder-btn">
              {loading ? 'Creating...' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SalesReminders;
