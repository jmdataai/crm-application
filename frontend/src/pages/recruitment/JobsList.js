import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobsAPI, formatApiError } from '../../services/api';
import { 
  Search, Plus, Briefcase, MapPin, Clock, Users, MoreVertical, Edit, Trash2, Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

const JobsList = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchJobs();
  }, [search, showActive]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = { is_active: showActive };
      if (search) params.search = search;
      const response = await jobsAPI.getAll(params);
      setJobs(response.data || []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await jobsAPI.delete(deleteId);
      setDeleteId(null);
      fetchJobs();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const toggleJobStatus = async (jobId, currentStatus) => {
    try {
      await jobsAPI.update(jobId, { is_active: !currentStatus });
      fetchJobs();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="jobs-list-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Jobs</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Manage your job openings
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn-primary flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg, var(--tertiary) 0%, var(--tertiary-container) 100%)' }}
          data-testid="create-job-btn"
        >
          <Plus className="w-4 h-4" />
          Post Job
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
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
                data-testid="search-input"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowActive(true)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${showActive ? 'surface-container-lowest ambient-shadow' : ''}`}
              style={{ color: showActive ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
            >
              Active
            </button>
            <button
              onClick={() => setShowActive(false)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${!showActive ? 'surface-container-lowest ambient-shadow' : ''}`}
              style={{ color: !showActive ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
            >
              Closed
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Jobs Grid */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-widget py-12 text-center">
          <Briefcase className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
          <p className="title-sm mb-2">No jobs found</p>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            {showActive ? 'Create a new job posting to get started' : 'No closed jobs'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {jobs.map((job) => (
            <div 
              key={job.id} 
              className="card-widget cursor-pointer hover:shadow-lg transition-all"
              onClick={() => navigate(`/recruitment/jobs/${job.id}`)}
              data-testid={`job-card-${job.id}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(0, 98, 67, 0.1)' }}
                  >
                    <Briefcase className="w-6 h-6" style={{ color: 'var(--tertiary)' }} />
                  </div>
                  <div>
                    <p className="title-sm">{job.title}</p>
                    <p className="label-sm">{job.department || 'General'}</p>
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 rounded-lg hover:bg-gray-100">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/recruitment/jobs/${job.id}`)}>
                        <Eye className="w-4 h-4 mr-2" /> View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleJobStatus(job.id, job.is_active)}>
                        {job.is_active ? 'Close Job' : 'Reopen Job'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteId(job.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                {job.location && (
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    <MapPin className="w-4 h-4" /> {job.location}
                  </span>
                )}
                {job.employment_type && (
                  <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    <Clock className="w-4 h-4" /> {job.employment_type}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--ghost-border)' }}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: 'var(--tertiary)' }} />
                  <span className="body-md">{job.candidate_count || 0} candidates</span>
                </div>
                <span className={`chip ${job.is_active ? 'chip-success' : 'chip-default'}`}>
                  {job.is_active ? 'Active' : 'Closed'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      <CreateJobModal 
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); fetchJobs(); }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
          </DialogHeader>
          <p className="body-md py-4">Are you sure you want to delete this job? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const CreateJobModal = ({ open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    department: '',
    location: '',
    employment_type: 'Full-time',
    description: '',
    requirements: '',
    salary_range: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await jobsAPI.create(formData);
      setFormData({
        title: '',
        department: '',
        location: '',
        employment_type: 'Full-time',
        description: '',
        requirements: '',
        salary_range: ''
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
          <DialogTitle>Post New Job</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
              {error}
            </div>
          )}
          <div>
            <label className="label-sm block mb-1">Job Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
              required
              data-testid="job-title-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm block mb-1">Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm block mb-1">Employment Type</label>
              <select
                value={formData.employment_type}
                onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                className="input-field"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Remote">Remote</option>
              </select>
            </div>
            <div>
              <label className="label-sm block mb-1">Salary Range</label>
              <input
                type="text"
                value={formData.salary_range}
                onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
                className="input-field"
                placeholder="e.g., $80k - $120k"
              />
            </div>
          </div>
          <div>
            <label className="label-sm block mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field min-h-[80px]"
              rows={3}
            />
          </div>
          <div>
            <label className="label-sm block mb-1">Requirements</label>
            <textarea
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              className="input-field min-h-[80px]"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="submit-job-btn">
              {loading ? 'Creating...' : 'Post Job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default JobsList;
