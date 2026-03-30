import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI, formatApiError } from '../../services/api';
import { 
  Users, Briefcase, Calendar, Clock, ArrowUpRight, 
  CheckCircle, UserPlus, TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

const candidateStatusColors = {
  sourced: 'chip-default',
  screened: 'chip-default',
  shortlisted: 'chip-pending',
  interview_scheduled: 'chip-primary',
  interviewed: 'chip-pending',
  selected: 'chip-success',
  rejected: 'chip-error',
  onboarded: 'chip-success'
};

const RecruitmentDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await dashboardAPI.getRecruitment();
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
          <div className="w-12 h-12 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--tertiary)' }}></div>
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

  const { candidate_stats, total_candidates, active_jobs, upcoming_interviews, today_tasks, recent_candidates, job_pipelines } = data || {};

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="recruitment-dashboard">
      {/* Header */}
      <div className="mb-8">
        <h1 className="headline-sm mb-2" style={{ color: 'var(--on-surface)' }}>Recruitment Dashboard</h1>
        <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Big Numbers */}
        <div className="col-span-3 card-widget" data-testid="total-candidates-card">
          <p className="label-sm mb-2">TOTAL CANDIDATES</p>
          <p className="display-lg" style={{ color: 'var(--tertiary)' }}>{total_candidates || 0}</p>
        </div>
        <div className="col-span-3 card-widget" data-testid="active-jobs-card">
          <p className="label-sm mb-2">ACTIVE JOBS</p>
          <p className="display-lg" style={{ color: 'var(--primary)' }}>{active_jobs || 0}</p>
        </div>
        
        {/* Status Breakdown */}
        <div className="col-span-6 card-widget">
          <p className="label-sm mb-4">PIPELINE BREAKDOWN</p>
          <div className="grid grid-cols-4 gap-3">
            <StatusCard label="Sourced" value={candidate_stats?.sourced || 0} color="var(--on-surface-variant)" />
            <StatusCard label="Shortlisted" value={candidate_stats?.shortlisted || 0} color="var(--amber)" />
            <StatusCard label="Interviewing" value={(candidate_stats?.interview_scheduled || 0) + (candidate_stats?.interviewed || 0)} color="var(--primary)" />
            <StatusCard label="Selected" value={candidate_stats?.selected || 0} color="var(--tertiary)" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Side - 70% */}
        <div className="col-span-8 space-y-6">
          {/* Upcoming Interviews */}
          <div className="card-widget" data-testid="interviews-section">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
                <h2 className="title-sm">Upcoming Interviews</h2>
              </div>
              <Link to="/recruitment/interviews" className="body-md flex items-center gap-1" style={{ color: 'var(--tertiary)' }}>
                View all <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
            {upcoming_interviews?.length > 0 ? (
              <div className="space-y-3">
                {upcoming_interviews.slice(0, 5).map((interview) => (
                  <div 
                    key={interview.id}
                    className="flex items-center justify-between p-4 rounded-lg"
                    style={{ backgroundColor: 'var(--surface-container-low)' }}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'var(--tertiary)', color: 'white' }}
                      >
                        {interview.candidate_name?.charAt(0) || 'C'}
                      </div>
                      <div>
                        <p className="title-sm">{interview.candidate_name}</p>
                        <p className="label-sm">{interview.interview_type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="body-md">{interview.scheduled_at?.split('T')[0]}</p>
                      <p className="label-sm">{interview.scheduled_at?.split('T')[1]?.substring(0, 5)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No upcoming interviews
              </p>
            )}
          </div>

          {/* Job Pipelines */}
          <div className="card-widget" data-testid="job-pipelines-section">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
                <h2 className="title-sm">Job Pipelines</h2>
              </div>
              <Link to="/recruitment/jobs" className="body-md" style={{ color: 'var(--tertiary)' }}>
                View all jobs
              </Link>
            </div>
            {job_pipelines?.length > 0 ? (
              <div className="space-y-4">
                {job_pipelines.slice(0, 4).map((job) => (
                  <div key={job.job_id} className="p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                    <p className="title-sm mb-3">{job.job_title}</p>
                    <div className="flex gap-2">
                      <PipelineBar stage="Sourced" count={job.pipeline?.sourced || 0} total={Object.values(job.pipeline || {}).reduce((a, b) => a + b, 0)} color="var(--on-surface-variant)" />
                      <PipelineBar stage="Screening" count={(job.pipeline?.screened || 0) + (job.pipeline?.shortlisted || 0)} total={Object.values(job.pipeline || {}).reduce((a, b) => a + b, 0)} color="var(--amber)" />
                      <PipelineBar stage="Interview" count={(job.pipeline?.interview_scheduled || 0) + (job.pipeline?.interviewed || 0)} total={Object.values(job.pipeline || {}).reduce((a, b) => a + b, 0)} color="var(--primary)" />
                      <PipelineBar stage="Hired" count={(job.pipeline?.selected || 0) + (job.pipeline?.onboarded || 0)} total={Object.values(job.pipeline || {}).reduce((a, b) => a + b, 0)} color="var(--tertiary)" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md py-8 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No active jobs
              </p>
            )}
          </div>
        </div>

        {/* Right Side - 30% */}
        <div className="col-span-4 space-y-6">
          {/* Today's Tasks */}
          <div className="card-widget" data-testid="today-tasks-section">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
              <h2 className="title-sm">Today's Tasks</h2>
            </div>
            {today_tasks?.length > 0 ? (
              <div className="space-y-3">
                {today_tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
                    <p className="title-sm">{task.title}</p>
                    <p className="label-sm mt-1">{task.due_date?.split('T')[0]}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-md py-4 text-center" style={{ color: 'var(--on-surface-variant)' }}>
                No tasks for today
              </p>
            )}
          </div>

          {/* Recent Candidates */}
          <div className="card-widget" data-testid="recent-candidates-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="title-sm">Recent Candidates</h2>
              <Link to="/recruitment/candidates" className="body-md" style={{ color: 'var(--tertiary)' }}>
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {recent_candidates?.slice(0, 6).map((candidate) => (
                <Link 
                  key={candidate.id} 
                  to={`/recruitment/candidates/${candidate.id}`}
                  className="flex items-center justify-between p-2 rounded-lg transition-all hover:bg-opacity-50"
                  style={{ backgroundColor: 'var(--surface-container-low)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="title-sm truncate">{candidate.full_name}</p>
                    <p className="label-sm truncate">{candidate.current_role || 'No role'}</p>
                  </div>
                  <span className={`chip ${candidateStatusColors[candidate.status] || 'chip-default'}`}>
                    {candidate.status?.replace('_', ' ')}
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

const StatusCard = ({ label, value, color }) => (
  <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-container-low)' }}>
    <p className="headline-sm" style={{ color }}>{value}</p>
    <p className="label-sm mt-1">{label}</p>
  </div>
);

const PipelineBar = ({ stage, count, total, color }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex-1">
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-container-high)' }}>
        <div 
          className="h-full rounded-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <p className="label-sm mt-1 text-center">{count}</p>
    </div>
  );
};

export default RecruitmentDashboard;
