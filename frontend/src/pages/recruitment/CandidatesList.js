import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { candidatesAPI, jobsAPI, formatApiError } from '../../services/api';
import { 
  Search, Plus, User, Building, Briefcase, MoreVertical, Edit, Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

const statusOptions = [
  { value: '', label: 'All Statuses' },
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

const CandidatesList = () => {
  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobs, setJobs] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const navigate = useNavigate();

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (jobId) params.job_id = jobId;
      
      const response = await candidatesAPI.getAll(params);
      setCandidates(response.data.candidates || []);
      setTotal(response.data.total || 0);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search, status, jobId]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await jobsAPI.getAll({ is_active: true });
        setJobs(response.data || []);
      } catch (err) {
        console.error('Failed to fetch jobs');
      }
    };
    fetchJobs();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await candidatesAPI.delete(deleteId);
      setDeleteId(null);
      fetchCandidates();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="candidates-list-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Candidates</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>{total} total candidates</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, var(--tertiary) 0%, var(--tertiary-container) 100%)' }}
          data-testid="add-candidate-btn"
        >
          <Plus className="w-4 h-4" />
          Add Candidate
        </button>
      </div>

      {/* Filters */}
      <div className="card-widget mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--on-surface-variant)' }} />
              <input
                type="text"
                placeholder="Search candidates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
                data-testid="search-input"
              />
            </div>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input-field w-48"
            data-testid="status-filter"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="input-field w-48"
            data-testid="job-filter"
          >
            <option value="">All Jobs</option>
            {jobs.map(job => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card-widget overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center">
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading candidates...</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-12 text-center">
            <User className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
            <p className="title-sm mb-2">No candidates found</p>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
              Add candidates to start building your pipeline
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Current Role</th>
                <th>Job Applied</th>
                <th>Status</th>
                <th>Experience</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr 
                  key={candidate.id} 
                  className="cursor-pointer"
                  onClick={() => navigate(`/recruitment/candidates/${candidate.id}`)}
                  data-testid={`candidate-row-${candidate.id}`}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--tertiary)', color: 'white' }}
                      >
                        {candidate.full_name?.charAt(0) || 'C'}
                      </div>
                      <div>
                        <p className="title-sm">{candidate.full_name}</p>
                        <p className="label-sm">{candidate.email || 'No email'}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>
                      <p className="body-md">{candidate.current_role || '-'}</p>
                      <p className="label-sm">{candidate.current_company || ''}</p>
                    </div>
                  </td>
                  <td>
                    <span className="body-md">{candidate.job_title || '-'}</span>
                  </td>
                  <td>
                    <span className={`chip ${statusColors[candidate.status] || 'chip-default'}`}>
                      {candidate.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className="body-md">{candidate.experience_years ? `${candidate.experience_years} yrs` : '-'}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 rounded-lg hover:bg-gray-100">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/recruitment/candidates/${candidate.id}`)}>
                          <Edit className="w-4 h-4 mr-2" /> View / Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeleteId(candidate.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Candidate Modal */}
      <CreateCandidateModal 
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); fetchCandidates(); }}
        jobs={jobs}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Candidate</DialogTitle>
          </DialogHeader>
          <p className="body-md py-4">Are you sure you want to delete this candidate?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const CreateCandidateModal = ({ open, onClose, onSuccess, jobs }) => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    current_company: '',
    current_role: '',
    experience_years: '',
    source: '',
    job_id: '',
    status: 'sourced',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = { ...formData };
      if (data.experience_years) {
        data.experience_years = parseInt(data.experience_years);
      } else {
        delete data.experience_years;
      }
      if (!data.job_id) delete data.job_id;
      
      await candidatesAPI.create(data);
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        current_company: '',
        current_role: '',
        experience_years: '',
        source: '',
        job_id: '',
        status: 'sourced',
        notes: ''
      });
      onSuccess();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm block mb-1">Full Name *</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="input-field"
                required
                data-testid="candidate-name-input"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Experience (years)</label>
              <input
                type="number"
                value={formData.experience_years}
                onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                className="input-field"
                min="0"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Current Company</label>
              <input
                type="text"
                value={formData.current_company}
                onChange={(e) => setFormData({ ...formData, current_company: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Current Role</label>
              <input
                type="text"
                value={formData.current_role}
                onChange={(e) => setFormData({ ...formData, current_role: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm block mb-1">Job Position</label>
              <select
                value={formData.job_id}
                onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                className="input-field"
              >
                <option value="">Select job</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-sm block mb-1">Source</label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="input-field"
                placeholder="e.g., LinkedIn, Referral"
              />
            </div>
          </div>
          <div>
            <label className="label-sm block mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input-field min-h-[80px]"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="submit-candidate-btn">
              {loading ? 'Adding...' : 'Add Candidate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CandidatesList;
