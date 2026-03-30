import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leadsAPI, usersAPI, formatApiError } from '../../services/api';
import { 
  Search, Filter, Plus, ChevronDown, MoreVertical, 
  Phone, Mail, Building, User, Trash2, Edit
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

const LeadsList = () => {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [salesReps, setSalesReps] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const navigate = useNavigate();

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (assignedTo) params.assigned_to = assignedTo;
      
      const response = await leadsAPI.getAll(params);
      setLeads(response.data.leads || []);
      setTotal(response.data.total || 0);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search, status, assignedTo]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    const fetchSalesReps = async () => {
      try {
        const response = await usersAPI.getSalesReps();
        setSalesReps(response.data || []);
      } catch (err) {
        console.error('Failed to fetch sales reps');
      }
    };
    fetchSalesReps();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await leadsAPI.delete(deleteId);
      setDeleteId(null);
      fetchLeads();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  return (
    <div className="animate-fadeIn" data-testid="leads-list-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="headline-sm mb-1" style={{ color: 'var(--on-surface)' }}>Leads</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>{total} total leads</p>
        </div>
        <div className="flex gap-3">
          <Link to="/sales/import" className="btn-secondary flex items-center gap-2" data-testid="import-leads-btn">
            Import
          </Link>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="btn-primary flex items-center gap-2"
            data-testid="create-lead-btn"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card-widget mb-6" data-testid="filters-section">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--on-surface-variant)' }} />
              <input
                type="text"
                placeholder="Search leads..."
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
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="input-field w-48"
            data-testid="owner-filter"
          >
            <option value="">All Owners</option>
            {salesReps.map(rep => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card-widget overflow-x-auto" data-testid="leads-table">
        {loading ? (
          <div className="py-12 text-center">
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>Loading leads...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center">
            <User className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
            <p className="title-sm mb-2">No leads found</p>
            <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
              Get started by adding or importing leads
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className="cursor-pointer"
                  onClick={() => navigate(`/sales/leads/${lead.id}`)}
                  data-testid={`lead-row-${lead.id}`}
                >
                  <td>
                    <div>
                      <p className="title-sm">{lead.full_name}</p>
                      {lead.job_title && (
                        <p className="label-sm">{lead.job_title}</p>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4" style={{ color: 'var(--on-surface-variant)' }} />
                      <span>{lead.company || '-'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      {lead.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" style={{ color: 'var(--on-surface-variant)' }} />
                          <span className="truncate max-w-[150px]">{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" style={{ color: 'var(--on-surface-variant)' }} />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${statusColors[lead.status] || 'chip-default'}`}>
                      {lead.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className="body-md">{lead.assigned_owner_name || '-'}</span>
                  </td>
                  <td>
                    <span className="body-md">{lead.next_follow_up?.split('T')[0] || '-'}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 rounded-lg hover:bg-gray-100" data-testid={`lead-actions-${lead.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/sales/leads/${lead.id}`)}>
                          <Edit className="w-4 h-4 mr-2" /> View / Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeleteId(lead.id)}
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

      {/* Create Lead Modal */}
      <CreateLeadModal 
        open={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
        onSuccess={() => { setShowCreateModal(false); fetchLeads(); }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
          </DialogHeader>
          <p className="body-md py-4">Are you sure you want to delete this lead? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-btn">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const CreateLeadModal = ({ open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company: '',
    job_title: '',
    source: '',
    status: 'new',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await leadsAPI.create(formData);
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        company: '',
        job_title: '',
        source: '',
        status: 'new',
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
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
                data-testid="create-lead-name"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input-field"
                data-testid="create-lead-email"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-field"
                data-testid="create-lead-phone"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Company</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="input-field"
                data-testid="create-lead-company"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Job Title</label>
              <input
                type="text"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-sm block mb-1">Source</label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="input-field"
                placeholder="e.g., Apollo, LinkedIn"
              />
            </div>
          </div>
          <div>
            <label className="label-sm block mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="input-field"
            >
              {statusOptions.slice(1).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
            <Button type="submit" disabled={loading} data-testid="submit-create-lead">
              {loading ? 'Creating...' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LeadsList;
