import React, { useState, useEffect } from 'react';
import { interviewsAPI, formatApiError } from '../../services/api';
import { Calendar, Clock, Video, User, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { format } from 'date-fns';

const Interviews = () => {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState(null);

  useEffect(() => {
    fetchInterviews();
  }, [showCompleted]);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const params = showCompleted ? {} : { upcoming: true };
      const response = await interviewsAPI.getAll(params);
      setInterviews(response.data || []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const markAsCompleted = async (interviewId, feedback, rating) => {
    try {
      await interviewsAPI.update(interviewId, { completed: true, feedback, rating });
      setSelectedInterview(null);
      fetchInterviews();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const todayInterviews = interviews.filter(i => i.scheduled_at?.startsWith(today) && !i.completed);
  const upcomingInterviews = interviews.filter(i => !i.scheduled_at?.startsWith(today) && !i.completed);
  const completedInterviews = interviews.filter(i => i.completed);

  return (
    <div className="animate-fadeIn recruitment-mode" data-testid="interviews-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Interviews</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Manage scheduled interviews
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompleted(false)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${!showCompleted ? 'surface-container-lowest ambient-shadow' : ''}`}
            style={{ color: !showCompleted ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
          >
            Upcoming
          </button>
          <button
            onClick={() => setShowCompleted(true)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${showCompleted ? 'surface-container-lowest ambient-shadow' : ''}`}
            style={{ color: showCompleted ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}
          >
            All
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center">
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading interviews...</p>
        </div>
      ) : interviews.length === 0 ? (
        <div className="card-widget py-12 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
          <p className="title-sm mb-2">No interviews found</p>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Schedule interviews from candidate profiles
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Today's Interviews */}
          {!showCompleted && todayInterviews.length > 0 && (
            <div className="col-span-12">
              <div className="card-widget" style={{ borderLeft: '3px solid var(--tertiary)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
                  <h2 className="title-sm" style={{ color: 'var(--tertiary)' }}>Today's Interviews</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {todayInterviews.map((interview) => (
                    <InterviewCard 
                      key={interview.id} 
                      interview={interview} 
                      onComplete={() => setSelectedInterview(interview)}
                      highlight
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Upcoming Interviews */}
          {!showCompleted && upcomingInterviews.length > 0 && (
            <div className="col-span-12">
              <div className="card-widget">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                  <h2 className="title-sm">Upcoming</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {upcomingInterviews.map((interview) => (
                    <InterviewCard 
                      key={interview.id} 
                      interview={interview} 
                      onComplete={() => setSelectedInterview(interview)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Completed Interviews */}
          {showCompleted && completedInterviews.length > 0 && (
            <div className="col-span-12">
              <div className="card-widget">
                <div className="flex items-center gap-2 mb-4">
                  <Check className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
                  <h2 className="title-sm">Completed</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {completedInterviews.map((interview) => (
                    <InterviewCard key={interview.id} interview={interview} completed />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complete Interview Modal */}
      <CompleteInterviewModal
        open={!!selectedInterview}
        interview={selectedInterview}
        onClose={() => setSelectedInterview(null)}
        onComplete={markAsCompleted}
      />
    </div>
  );
};

const InterviewCard = ({ interview, onComplete, completed, highlight }) => (
  <div 
    className="p-4 rounded-lg"
    style={{ 
      backgroundColor: highlight ? 'rgba(0, 98, 67, 0.05)' : 'var(--surface-container-low)',
      borderLeft: highlight ? '3px solid var(--tertiary)' : 'none'
    }}
    data-testid={`interview-${interview.id}`}
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: completed ? 'var(--on-surface-variant)' : 'var(--tertiary)', color: 'white' }}
        >
          {interview.candidate_name?.charAt(0) || 'C'}
        </div>
        <div>
          <p className="title-sm">{interview.candidate_name}</p>
          <p className="label-sm">{interview.interview_type}</p>
        </div>
      </div>
      {completed ? (
        <span className="chip chip-success">Completed</span>
      ) : (
        <button 
          onClick={() => onComplete && onComplete()}
          className="btn-secondary text-sm py-1 px-3"
        >
          Mark Done
        </button>
      )}
    </div>

    <div className="flex items-center gap-4 mt-3">
      <span className="label-sm flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {interview.scheduled_at?.split('T')[0]}
      </span>
      <span className="label-sm flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {interview.scheduled_at?.split('T')[1]?.substring(0, 5)}
      </span>
    </div>

    {interview.feedback && (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--ghost-border)' }}>
        <p className="label-sm mb-1">FEEDBACK</p>
        <p className="body-md">{interview.feedback}</p>
        {interview.rating && (
          <p className="label-sm mt-2">Rating: {interview.rating}/5</p>
        )}
      </div>
    )}
  </div>
);

const CompleteInterviewModal = ({ open, interview, onClose, onComplete }) => {
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(3);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onComplete(interview?.id, feedback, rating);
    setFeedback('');
    setRating(3);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Interview</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="body-md">
            Mark interview with <strong>{interview?.candidate_name}</strong> as completed
          </p>
          <div>
            <label className="label-sm block mb-1">Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="input-field min-h-[100px]"
              placeholder="How did the interview go?"
              rows={4}
            />
          </div>
          <div>
            <label className="label-sm block mb-2">Rating</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={`w-10 h-10 rounded-lg font-medium transition-all ${
                    rating >= r ? 'surface-container-lowest ambient-shadow' : ''
                  }`}
                  style={{ 
                    backgroundColor: rating >= r ? 'var(--tertiary)' : 'var(--surface-container-low)',
                    color: rating >= r ? 'white' : 'var(--on-surface-variant)'
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Complete Interview'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Interviews;
