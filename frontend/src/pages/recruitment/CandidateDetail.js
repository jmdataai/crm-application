import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { candidatesAPI, activitiesAPI, interviewsAPI, jobsAPI, formatApiError } from '../../services/api';
import { 
  ArrowLeft, Phone, Mail, Building, Briefcase, Calendar, Clock,
  Edit, Trash2, Plus, FileText, Video, Save, User
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

const statusOptions = [
  { value: 'sourced', label: 'Sourced' },
  { value: 'screened', label: 'Screened' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'selected', label: 'Selected' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'onboarded', label: 'Onboarded' },
];

const statusColors = {
  sourced: 'chip-default',
  screened: 'chip-default',
  shortlisted: 'chip-pending',
  interview_scheduled: 'chip-primary',
  interviewed: 'chip-pending',
  selected: 'chip-success',
  rejected: 'chip-error',
  onboarded: 'chip-success'
};

const CandidateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [jobs, setJobs] = useState([]);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCandidate();
    fetchJobs();
  }, [id]);

  const fetchCandidate = async () => {
    try {
      const response = await candidatesAPI.getOne(id);
      setCandidate(response.data);
      setFormData(response.data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await jobsAPI.getAll({ is_active: true });
      setJobs(response.data || []);
    } catch (err) {
      console.error('Failed to fetch jobs');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = { ...formData };
      if (data.experience_years) {
        data.experience_years = parseInt(data.experience_years);
      }
      await candidatesAPI.update(id, data);
      await fetchCandidate();
      setIsEditing(false);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this candidate?')) {
      try {
        await candidatesAPI.delete(id);
        navigate('/recruitment/candidates');
      } catch (err) {
        setError(formatApiError(err));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading candidate...</p>
      </div>
    );
  }

  if (error && !candidate) {
    return (
      <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--error-container)' }}>
        <p style={{ color: 'var(--error)' }}>{error}</p>
        <Link to="/recruitment/candidates" className="btn-secondary mt-4 inline-block">Back to Candidates</Link>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="candidate-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/recruitment/candidates')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
              style={{ backgroundColor: 'var(--tertiary)', color: 'white' }}
            >
              {candidate?.full_name?.charAt(0) || 'C'}
            </div>
            <div>
              <h1 className="headline-sm" style={{ color: 'var(--on-surface)' }}>{candidate?.full_name}</h1>
              <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
                {candidate?.current_role} {candidate?.current_company && `at ${candidate.current_company}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex items-center gap-2" disabled={saving}>
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="btn-secondary flex items-center gap-2">
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button onClick={handleDelete} className="btn-secondary flex items-center gap-2" style={{ color: 'var(--error)' }}>
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
          {/* Candidate Info Card */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Candidate Information</h2>
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
                label="Experience (years)" 
                value={formData.experience_years} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, experience_years: v})}
                type="number"
              />
              <InfoField 
                label="Current Company" 
                value={formData.current_company} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, current_company: v})}
                icon={Building}
              />
              <InfoField 
                label="Current Role" 
                value={formData.current_role} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, current_role: v})}
              />
              <InfoField 
                label="Source" 
                value={formData.source} 
                editing={isEditing}
                onChange={(v) => setFormData({...formData, source: v})}
              />
              <div>
                <label className="label-sm block mb-1">Job Position</label>
                {isEditing ? (
                  <select
                    value={formData.job_id || ''}
                    onChange={(e) => setFormData({...formData, job_id: e.target.value})}
                    className="input-field"
                  >
                    <option value="">Select job</option>
                    {jobs.map(job => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                ) : (
                  <p className="body-md flex items-center gap-2">
                    <Briefcase className="w-4 h-4" style={{ color: 'var(--on-surface-variant)' }} />
                    {candidate?.job_title || '-'}
                  </p>
                )}
              </div>
              <div>
                <label className="label-sm block mb-1">Status</label>
                {isEditing ? (
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="input-field"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`chip ${statusColors[candidate?.status] || 'chip-default'}`}>
                    {candidate?.status?.replace('_', ' ')}
                  </span>
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
                  {candidate?.notes || 'No notes'}
                </p>
              )}
            </div>
          </div>

          {/* Interviews */}
          <div className="card-widget">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Interviews</h2>
              <button 
                onClick={() => setShowInterviewModal(true)} 
                className="btn-secondary flex items-center gap-2"
                data-testid="schedule-interview-btn"
              >
                <Plus className="w-4 h-4" />
                Schedule Interview
              </button>
            </div>
            {candidate?.interviews?.length > 0 ? (
              <div className="space-y-3">
                {candidate.interviews.map((interview) => (
                  <div 
                    key={interview.id}
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: 'var(--surface-container-low)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Video className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
                        <div>
                          <p className="title-sm">{interview.interview_type}</p>
                          <p className="label-sm">{interview.scheduled_at?.split('T')[0]} at {interview.scheduled_at?.split('T')[1]?.substring(0, 5)}</p>
                        </div>
                      </div>
                      <span className={`chip ${interview.completed ? 'chip-success' : 'chip-pending'}`}>
                        {interview.completed ? 'Completed' : 'Scheduled'}
                      </span>
                    </div>
                    {interview.feedback && (
                      <p className="body-md mt-3 pt-3" style={{ borderTop: '1px solid var(--ghost-border)' }}>
                        {interview.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No interviews scheduled
              </p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="card-widget">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Activity History</h2>
              <button 
                onClick={() => setShowActivityModal(true)} 
                className="btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Log Activity
              </button>
            </div>
            <div className="space-y-1">
              {candidate?.activities?.length > 0 ? (
                candidate.activities.map((activity) => (
                  <div key={activity.id} className="timeline-item">
                    <div className="flex items-start gap-3">
                      <div 
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: 'var(--surface-container-low)' }}
                      >
                        <FileText className="w-4 h-4" style={{ color: 'var(--tertiary)' }} />
                      </div>
                      <div className="flex-1">
                        <p className="body-md">{activity.description}</p>
                        <p className="label-sm mt-1">{activity.created_at?.split('T')[0]}</p>
                      </div>
                    </div>
                  </div>
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
                onClick={() => setShowInterviewModal(true)}
                className="w-full btn-secondary text-left flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Schedule Interview
              </button>
              <button 
                onClick={() => setShowActivityModal(true)}
                className="w-full btn-secondary text-left flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Add Note
              </button>
            </div>
          </div>

          {/* Status History */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Status History</h2>
            {candidate?.status_history?.length > 0 ? (
              <div className="space-y-3">
                {candidate.status_history.map((item) => (
                  <div key={item.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
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

          {/* Details */}
          <div className="card-widget">
            <h2 className="title-sm mb-4">Details</h2>
            <div className="space-y-3">
              <div>
                <p className="label-sm">Added</p>
                <p className="body-md">{candidate?.created_at?.split('T')[0]}</p>
              </div>
              <div>
                <p className="label-sm">Last Updated</p>
                <p className="body-md">{candidate?.updated_at?.split('T')[0]}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ActivityModal 
        open={showActivityModal} 
        onClose={() => setShowActivityModal(false)}
        candidateId={id}
        onSuccess={() => { setShowActivityModal(false); fetchCandidate(); }}
      />
      <InterviewModal 
        open={showInterviewModal}
        onClose={() => setShowInterviewModal(false)}
        candidateId={id}
        jobId={candidate?.job_id}
        onSuccess={() => { setShowInterviewModal(false); fetchCandidate(); }}
      />
    </div>
  );
};

const InfoField = ({ label, value, editing, onChange, icon: Icon, type = 'text' }) => (
  <div>
    <label className="label-sm block mb-1">{label}</label>
    {editing ? (
      <input
        type={type}
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

const ActivityModal = ({ open, onClose, candidateId, onSuccess }) => {
  const [type, setType] = useState('note');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await activitiesAPI.create({
        candidate_id: candidateId,
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

const InterviewModal = ({ open, onClose, candidateId, jobId, onSuccess }) => {
  const [scheduledAt, setScheduledAt] = useState('');
  const [interviewType, setInterviewType] = useState('Phone Screen');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await interviewsAPI.create({
        candidate_id: candidateId,
        job_id: jobId || '',
        scheduled_at: scheduledAt,
        interview_type: interviewType,
        notes
      });
      setScheduledAt('');
      setNotes('');
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
          <DialogTitle>Schedule Interview</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-sm block mb-1">Date & Time *</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label-sm block mb-1">Interview Type</label>
            <select
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              className="input-field"
            >
              <option value="Phone Screen">Phone Screen</option>
              <option value="Technical">Technical</option>
              <option value="HR Round">HR Round</option>
              <option value="Final Round">Final Round</option>
              <option value="On-site">On-site</option>
            </select>
          </div>
          <div>
            <label className="label-sm block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field min-h-[80px]"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CandidateDetail;
