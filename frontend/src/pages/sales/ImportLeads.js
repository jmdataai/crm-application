import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leadsAPI, importsAPI, formatApiError } from '../../services/api';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, ArrowLeft } from 'lucide-react';

const ImportLeads = () => {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const navigate = useNavigate();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
      setError('');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError('');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');
    setResult(null);

    try {
      const response = await leadsAPI.import(file);
      setResult(response.data);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto" data-testid="import-leads-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/sales/leads')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="headline-sm" style={{ color: 'var(--on-surface)' }}>Import Leads</h1>
          <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
            Upload a CSV or Excel file to import leads
          </p>
        </div>
      </div>

      {/* Instructions Card */}
      <div className="card-widget mb-6">
        <h2 className="title-sm mb-3">File Requirements</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="label-sm mb-2">SUPPORTED FORMATS</p>
            <div className="flex gap-2">
              <span className="chip chip-default">.CSV</span>
              <span className="chip chip-default">.XLSX</span>
              <span className="chip chip-default">.XLS</span>
            </div>
          </div>
          <div>
            <p className="label-sm mb-2">REQUIRED COLUMNS</p>
            <p className="body-md">Name or Full Name (required)</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="label-sm mb-2">OPTIONAL COLUMNS</p>
          <div className="flex flex-wrap gap-2">
            {['Email', 'Phone', 'Company', 'Job Title', 'Source'].map(col => (
              <span key={col} className="chip chip-default">{col}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div className="card-widget mb-6">
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-all ${
            dragActive ? 'border-blue-500 bg-blue-50' : ''
          }`}
          style={{ borderColor: dragActive ? 'var(--primary)' : 'var(--outline-variant)' }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          data-testid="drop-zone"
        >
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <FileSpreadsheet className="w-12 h-12" style={{ color: 'var(--primary)' }} />
              <div className="text-left">
                <p className="title-sm">{file.name}</p>
                <p className="body-md" style={{ color: 'var(--on-surface-variant)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button 
                onClick={() => setFile(null)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--on-surface-variant)' }} />
              <p className="title-sm mb-2">Drag and drop your file here</p>
              <p className="body-md mb-4" style={{ color: 'var(--on-surface-variant)' }}>
                or click to browse
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                data-testid="file-input"
              />
              <label htmlFor="file-upload" className="btn-secondary cursor-pointer">
                Select File
              </label>
            </>
          )}
        </div>

        {file && (
          <div className="mt-6 flex justify-end">
            <button 
              onClick={handleImport}
              disabled={importing}
              className="btn-primary flex items-center gap-2"
              data-testid="import-btn"
            >
              {importing ? 'Importing...' : 'Import Leads'}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--error-container)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="card-widget" data-testid="import-result">
          <h2 className="title-sm mb-4">Import Results</h2>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: 'var(--surface-container-low)' }}>
              <p className="display-lg" style={{ fontSize: '2rem', color: 'var(--on-surface)' }}>{result.total_rows}</p>
              <p className="label-sm">Total Rows</p>
            </div>
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: 'rgba(0, 125, 87, 0.1)' }}>
              <p className="display-lg" style={{ fontSize: '2rem', color: 'var(--tertiary)' }}>{result.successful}</p>
              <p className="label-sm">Successful</p>
            </div>
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: result.failed > 0 ? 'var(--error-container)' : 'var(--surface-container-low)' }}>
              <p className="display-lg" style={{ fontSize: '2rem', color: result.failed > 0 ? 'var(--error)' : 'var(--on-surface)' }}>{result.failed}</p>
              <p className="label-sm">Failed</p>
            </div>
          </div>

          {result.successful > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4" style={{ backgroundColor: 'rgba(0, 125, 87, 0.1)' }}>
              <Check className="w-5 h-5" style={{ color: 'var(--tertiary)' }} />
              <p className="body-md" style={{ color: 'var(--tertiary)' }}>
                Successfully imported {result.successful} leads
              </p>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                <h3 className="title-sm" style={{ color: 'var(--error)' }}>Errors ({result.errors.length})</h3>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.errors.map((err, idx) => (
                  <div key={idx} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--error-container)' }}>
                    <p className="body-md" style={{ color: 'var(--error)' }}>
                      Row {err.row}: {err.error}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={() => navigate('/sales/leads')} className="btn-primary">
              View Leads
            </button>
            <button onClick={() => { setFile(null); setResult(null); }} className="btn-secondary">
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportLeads;
