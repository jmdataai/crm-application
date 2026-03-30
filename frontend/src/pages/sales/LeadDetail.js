import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { leadsAPI, activitiesAPI, tasksAPI, remindersAPI, usersAPI, formatApiError } from '../../services/api';
import { 
  ArrowLeft, Phone, Mail, Building, User, Calendar, Clock,
  Edit, Trash2, Plus, MessageSquare, PhoneCall, Video, FileText, Save
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { format } from 'date-fns';

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'called', label: 'Called' },
  { value: 'interested', label: 'Interested' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'lost', label: 'Lost' },
  { value: 'follow_up_needed', label: 'Follow-up Needed' },
];

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

const activityIcons = {
  call: PhoneCall,
  email: Mail,
  meeting: Video,
  note: FileText,
  status_change: Clock
};

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [salesReps, setSalesReps] = useState([]);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLead();
    fetchSalesReps();
  }, [id]);

  const fetchLead = async () => {
    try {
      const response = await leadsAPI.getOne(id);
      setLead(response.data);
      setFormData(response.data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesReps = async () => {
    try {
      const response = await usersAPI.getSalesReps();
      setSalesReps(response.data || []);
    } catch (err) {
      console.error('Failed to fetch sales reps');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await leadsAPI.update(id, formData);
      await fetchLead();
      setIsEditing(false);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      try {
        await leadsAPI.delete(id);
        navigate('/sales/leads');
      } catch (err) {
        setError(formatApiError(err));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading lead...</p>
      </div>
    );
  }

  if (error && !lead) {
    return (
      <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--error-container)' }}>
        <p style={{ color: 'var(--error)' }}>{error}</p>
        <Link to="/sales/leads" className="btn-secondary mt-4 inline-block">Back to Leads</Link>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" data-testid="lead-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/sales/leads')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="headline-sm" style={{ color: 'var(--on-surface)' }}>{lead?.full_name}</h1>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
              {lead?.job_title} {lead?.company && `at ${lead.company}`}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving} data-testid="save-lead-btn">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="btn-secondary flex items-center gap-2" data-testid="edit-lead-btn">
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button onClick={handleDelete} className="btn-secondary flex items-center gap-2" style={{ color: 'var(--error)' }} data-testid="delete-lead-btn">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Main Info - 70% */}
        <div className="col-span-8 space-y-6">
          {/* Lead Info Card */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Lead Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField 
                label="Full Name" 
                value={formData.full_name} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, full_name: v})}
              />
              <InfoField 
                label="Email" 
                value={formData.email} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, email: v})}
                icon={Mail}
              />
              <InfoField 
                label="Phone" 
                value={formData.phone} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, phone: v})}
                icon={Phone}
              />
              <InfoField 
                label="Company" 
                value={formData.company} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, company: v})}
                icon={Building}
              />
              <InfoField 
                label="Job Title" 
                value={formData.job_title} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, job_title: v})}
              />
              <InfoField 
                label="Source" 
                value={formData.source} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, source: v})}
              />
              <div>
                <label className="label-sm block mb-1">Status</label>
                {isEditing ? (
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="input-field"
                    data-testid="lead-status-select"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`chip ${statusColors[lead?.status] || 'chip-default'}`}>
                    {lead?.status?.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div>
                <label className="label-sm block mb-1">Assigned Owner</label>
                {isEditing ? (
                  <select
                    value={formData.assigned_owner_id || ''}
                    onChange={(e) => setFormData({...formData, assigned_owner_id: e.target.value})}
                    className="input-field"
                  >
                    <option value="">Select owner</option>
                    {salesReps.map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="body-md">{lead?.assigned_owner_name || '-'}</p>
                )}
              </div>
              <div>
                <label className="label-sm block mb-1">Next Follow-up</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={formData.next_follow_up?.split('T')[0] || ''}
                    onChange={(e) => setFormData({...formData, next_follow_up: e.target.value})}
                    className="input-field"
                  />
                ) : (
                  <p className="body-md flex items-center gap-2">
                    <Calendar className="w-4 h-4" style={{ color: 'var(--on-surface-variant)' }} />
                    {lead?.next_follow_up?.split('T')[0] || '-'}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="label-sm block mb-1">Notes</label>
              {isEditing ? (
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="input-field min-h-[100px]"
                  rows={4}
                />
              ) : (
                <p className="body-md p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                  {lead?.notes || 'No notes'}
                </p>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="card-widget">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Activity History</h2>
              <button 
                onClick={() => setShowActivityModal(true)} 
                className="btn-secondary flex items-center gap-2"
                data-testid="add-activity-btn"
              >
                <Plus className="w-4 h-4" />
                Log Activity
              </button>
            </div>
            <div className="space-y-1">
              {lead?.activities?.length > 0 ? (
                lead.activities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))
              ) : (
                <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                  No activities logged yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - 30% */}
        <div className="col-span-4 space-y-6">
          {/* Quick Actions */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button 
                onClick={() => setShowTaskModal(true)}
                className="w-full btn-secondary text-left flex items-center gap-2"
                data-testid="create-task-btn"
              >
                <Clock className="w-4 h-4" />
                Create Task
              </button>
              <button 
                onClick={() => setShowReminderModal(true)}
                className="w-full btn-secondary text-left flex items-center gap-2"
                data-testid="set-reminder-btn"
              >
                <Calendar className="w-4 h-4" />
                Set Reminder
              </button>
            </div>
          </div>

          {/* Status History */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Status History</h2>
            {lead?.status_history?.length > 0 ? (
              <div className="space-y-3">
                {lead.status_history.map((item) => (
                  <div key={item.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`chip ${statusColors[item.old_status] || 'chip-default'}`}>
                        {item.old_status?.replace('_', ' ')}
                      </span>
                      <span>→</span>
                      <span className={`chip ${statusColors[item.new_status] || 'chip-default'}`}>
                        {item.new_status?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="label-sm">
                      by {item.changed_by_name} • {item.created_at?.split('T')[0]}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>No status changes</p>
            )}
          </div>

          {/* Lead Info Summary */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="label-sm">Created</p>
                <p className="body-md">{lead?.created_at?.split('T')[0]}</p>
              </div>
              <div>
                <p className="label-sm">Last Updated</p>
                <p className="body-md">{lead?.updated_at?.split('T')[0]}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ActivityModal 
        open={showActivityModal} 
        onClose={() => setShowActivityModal(false)}
        leadId={id}
        onSuccess={() => { setShowActivityModal(false); fetchLead(); }}
      />
      <TaskModal 
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        leadId={id}
        onSuccess={() => setShowTaskModal(false)}
      />
      <ReminderModal 
        open={showReminderModal}
        onClose={() => setShowReminderModal(false)}
        leadId={id}
        onSuccess={() => setShowReminderModal(false)}
      />
    </div>
  );
};

const InfoField = ({ label, value, editing, onChange, icon: Icon }) => (
  <div>
    <label className="label-sm block mb-1">{label}</label>
    {editing ? (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="input-field"
      />
    ) : (
      <p className="body-md flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4" style={{ color: 'var(--on-surface-variant)' }} />}
        {value || '-'}
      </p>
    )}
  </div>
);

const ActivityItem = ({ activity }) => {
  const Icon = activityIcons[activity.activity_type] || FileText;
  return (
    <div className="timeline-item">
      <div className="flex items-start gap-3">
        <div 
          className="p-2 rounded-lg"
          style={{ backgroundColor: 'var(--surface-container-low)' }}
        >
          <Icon className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1">
          <p className="body-md">{activity.description}</p>
          <p className="label-sm mt-1">{activity.created_at?.split('T')[0]}</p>
        </div>
      </div>
    </div>
  );
};

const ActivityModal = ({ open, onClose, leadId, onSuccess }) => {
  const [type, setType] = useState('note');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await activitiesAPI.create({
        lead_id: leadId,
        activity_type: type,
        description
      });
      setDescription('');
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
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-sm block mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input-field">
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
          <div>
            <label className="label-sm block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[100px]"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Log Activity'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const TaskModal = ({ open, onClose, leadId, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await tasksAPI.create({
        title,
        due_date: dueDate,
        priority,
        lead_id: leadId
      });
      setTitle('');
      setDueDate('');
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
            <label className="label-sm block mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label-sm block mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label-sm block mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ReminderModal = ({ open, onClose, leadId, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await remindersAPI.create({
        title,
        due_date: dueDate,
        lead_id: leadId,
        send_email: sendEmail
      });
      setTitle('');
      setDueDate('');
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
          <DialogTitle>Set Reminder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-sm block mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="label-sm block mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field" required />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="sendEmail" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <label htmlFor="sendEmail" className="body-md">Send email reminder</label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Setting...' : 'Set Reminder'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetail;
