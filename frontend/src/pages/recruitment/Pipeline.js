import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidatesAPI, jobsAPI, formatApiError } from '../../services/api';
import { User, ChevronRight, GripVertical } from 'lucide-react';

const stages = [
  { id: 'sourced', label: 'Sourced', color: 'var(--on-surface-variant)' },
  { id: 'screened', label: 'Screened', color: 'var(--on-surface-variant)' },
  { id: 'shortlisted', label: 'Shortlisted', color: 'var(--amber)' },
  { id: 'interview_scheduled', label: 'Interview', color: 'var(--primary)' },
  { id: 'interviewed', label: 'Interviewed', color: 'var(--primary)' },
  { id: 'selected', label: 'Selected', color: 'var(--tertiary)' },
  { id: 'onboarded', label: 'Onboarded', color: 'var(--tertiary)' },
];

const Pipeline = () => {
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [selectedJob]);

  const fetchJobs = async () => {
    try {
      const response = await jobsAPI.getAll({ is_active: true });
      setJobs(response.data || []);
    } catch (err) {
      console.error('Failed to fetch jobs');
    }
  };

  const fetchPipeline = async () => {
    setLoading(true);
    try {
      const params = selectedJob ? { job_id: selectedJob } : {};
      const response = await candidatesAPI.getPipeline(params);
      setPipeline(response.data || {});
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMoveCandidate = async (candidateId, newStatus) => {
    try {
      await candidatesAPI.update(candidateId, { status: newStatus });
      fetchPipeline();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const getNextStage = (currentStage) => {
    const currentIndex = stages.findIndex(s => s.id === currentStage);
    if (currentIndex < stages.length - 1) {
      return stages[currentIndex + 1].id;
    }
    return null;
  };

  const getPrevStage = (currentStage) => {
    const currentIndex = stages.findIndex(s => s.id === currentStage);
    if (currentIndex > 0) {
      return stages[currentIndex - 1].id;
    }
    return null;
  };

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="pipeline-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Pipeline</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Track candidates through the hiring process
          </p>
        </div>
        <select
          value={selectedJob}
          onChange={(e) => setSelectedJob(e.target.value)}
          className="input-field w-64"
          data-testid="job-filter"
        >
          <option value="">All Jobs</option>
          {jobs.map(job => (
            <option key={job.id} value={job.id}>{job.title}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Pipeline Board */}
      {loading ? (
        <div className="py-12 text-center">
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading pipeline...</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage.id} className="kanban-column flex-shrink-0" data-testid={`stage-${stage.id}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="title-sm">{stage.label}</span>
                </div>
                <span 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: 'var(--surface-container-high)', color: 'var(--on-surface)' }}
                >
                  {pipeline[stage.id]?.length || 0}
                </span>
              </div>

              <div className="space-y-2 min-h-[200px]">
                {pipeline[stage.id]?.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="kanban-card group"
                    onClick={() => navigate(`/recruitment/candidates/${candidate.id}`)}
                    data-testid={`candidate-card-${candidate.id}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                        style={{ backgroundColor: 'var(--tertiary)', color: 'white' }}
                      >
                        {candidate.full_name?.charAt(0) || 'C'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="title-sm truncate">{candidate.full_name}</p>
                        <p className="label-sm truncate">{candidate.current_role || 'No role'}</p>
                      </div>
                    </div>

                    {candidate.current_company && (
                      <p className="body-md mb-2 truncate" style={{ color: 'var(--on-surface-variant)' }}>
                        {candidate.current_company}
                      </p>
                    )}

                    {/* Quick move buttons */}
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {getPrevStage(stage.id) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCandidate(candidate.id, getPrevStage(stage.id));
                          }}
                          className="flex-1 p-2 rounded text-xs font-medium transition-all"
                          style={{ backgroundColor: 'var(--surface-container-high)' }}
                          title="Move back"
                        >
                          ← Back
                        </button>
                      )}
                      {getNextStage(stage.id) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCandidate(candidate.id, getNextStage(stage.id));
                          }}
                          className="flex-1 p-2 rounded text-xs font-medium transition-all"
                          style={{ backgroundColor: stage.color, color: 'white' }}
                          title="Move forward"
                        >
                          Next →
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {(!pipeline[stage.id] || pipeline[stage.id].length === 0) && (
                  <div 
                    className="p-4 rounded-lg text-center"
                    style={{ backgroundColor: 'var(--surface-container-high)', opacity: 0.6 }}
                  >
                    <User className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--on-surface-variant)' }} />
                    <p className="label-sm">No candidates</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Rejected Column */}
          <div className="kanban-column flex-shrink-0" style={{ backgroundColor: 'rgba(220, 38, 38, 0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: 'var(--error)' }}
                />
                <span className="title-sm" style={{ color: 'var(--error)' }}>Rejected</span>
              </div>
              <span 
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}
              >
                {pipeline['rejected']?.length || 0}
              </span>
            </div>

            <div className="space-y-2 min-h-[200px]">
              {pipeline['rejected']?.map((candidate) => (
                <div
                  key={candidate.id}
                  className="kanban-card"
                  onClick={() => navigate(`/recruitment/candidates/${candidate.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                      style={{ backgroundColor: 'var(--error)', color: 'white' }}
                    >
                      {candidate.full_name?.charAt(0) || 'C'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="title-sm truncate">{candidate.full_name}</p>
                      <p className="label-sm truncate">{candidate.current_role || 'No role'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pipeline;
