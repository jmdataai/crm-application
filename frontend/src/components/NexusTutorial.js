import React, { useEffect, useRef, useState } from 'react';
import { useTutorial } from '../hooks/useTutorial';

// Custom intro.js theme injected once
const INTRO_STYLE = `
  .introjs-tooltip {
    font-family: 'Inter', sans-serif !important;
    border-radius: 1rem !important;
    box-shadow: 0 20px 60px rgba(0,74,198,0.18) !important;
    border: 1.5px solid rgba(0,74,198,0.12) !important;
    min-width: 280px !important;
    max-width: 340px !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  .nexus-tip-header {
    background: linear-gradient(135deg, #004ac6 0%, #2563eb 100%);
    padding: 1rem 1.25rem 0.75rem;
    display: flex; align-items: center; gap: 0.625rem;
  }
  .nexus-tip-header .tip-icon {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem; flex-shrink: 0;
  }
  .nexus-tip-header .tip-step {
    font-size: 0.625rem; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(255,255,255,0.7);
    margin-bottom: 0.125rem;
  }
  .nexus-tip-header .tip-title {
    font-size: 0.9375rem; font-weight: 700; color: #fff; line-height: 1.2;
  }
  .introjs-tooltiptext {
    padding: 0.875rem 1.25rem 0.25rem !important;
    font-size: 0.8125rem !important;
    color: #434655 !important;
    line-height: 1.55 !important;
  }
  .introjs-tooltipbuttons {
    border-top: 1px solid #eaedff !important;
    padding: 0.625rem 1rem !important;
    display: flex !important; justify-content: flex-end !important; gap: 0.5rem !important;
  }
  .introjs-button {
    font-family: 'Inter', sans-serif !important;
    font-size: 0.8125rem !important; font-weight: 600 !important;
    border-radius: 0.5rem !important; padding: 0.4rem 1rem !important;
    border: none !important; cursor: pointer !important;
    text-shadow: none !important;
  }
  .introjs-prevbutton {
    background: #eaedff !important; color: #004ac6 !important;
  }
  .introjs-nextbutton, .introjs-donebutton {
    background: linear-gradient(135deg, #004ac6, #2563eb) !important;
    color: #fff !important;
  }
  .introjs-skipbutton {
    color: #737686 !important; font-size: 0.75rem !important;
    margin-right: auto !important; padding: 0.4rem 0.5rem !important;
    background: none !important;
  }
  .introjs-helperLayer {
    border-radius: 0.75rem !important;
    box-shadow: 0 0 0 2000px rgba(19,27,46,0.45), 0 0 0 3px #004ac6 !important;
  }
  .introjs-arrow { display: none !important; }
  .introjs-progressbar { background: linear-gradient(90deg, #004ac6, #2563eb) !important; height: 3px !important; }
  .introjs-progress { background: #eaedff !important; border-radius: 0 !important; height: 3px !important; margin: 0 !important; }
  .introjs-bullets { display: none !important; }
`;

// Tour definitions per page
const TOURS = {
  timesheet: [
    {
      element: '[data-tour="timesheet-week"]',
      icon: '📅',
      title: 'Your Weekly Timesheet',
      intro: 'This is your work week. Each row is a day — fill in your hours and what you worked on.',
    },
    {
      element: '[data-tour="timesheet-submit"]',
      icon: '✅',
      title: 'Submit for Approval',
      intro: 'Once your week is complete, hit Submit. Your manager gets notified and will approve it.',
    },
    {
      element: '[data-tour="timesheet-history"]',
      icon: '🕐',
      title: 'Past Weeks',
      intro: 'Switch between weeks here to view or edit previous entries before submission.',
    },
  ],
  leads: [
    {
      element: '[data-tour="leads-list"]',
      icon: '🏢',
      title: 'Your Lead Pipeline',
      intro: 'Every company you\'re prospecting lives here. Each card shows status, contact info, and follow-up reminders.',
    },
    {
      element: '[data-tour="leads-filter"]',
      icon: '🔍',
      title: 'Filter & Search',
      intro: 'Filter by status, segment, or search by company name — find any lead in seconds.',
    },
    {
      element: '[data-tour="leads-add"]',
      icon: '➕',
      title: 'Add a Lead',
      intro: 'Click here to add a new company. You can also import hundreds at once via the Import Leads page.',
    },
    {
      element: '[data-tour="leads-import"]',
      icon: '📥',
      title: 'Bulk Import',
      intro: 'Got a spreadsheet? Import entire hotlists — CSV or Excel — with automatic column detection.',
    },
  ],
  candidates: [
    {
      element: '[data-tour="candidates-list"]',
      icon: '👤',
      title: 'Candidate Pool',
      intro: 'All your candidates in one place — domestic and international. Filter by role, status, or search by name.',
    },
    {
      element: '[data-tour="candidates-add"]',
      icon: '➕',
      title: 'Add a Candidate',
      intro: 'Add candidates manually here, or use Import Candidates to bulk-upload from a hotlist.',
    },
    {
      element: '[data-tour="candidates-pipeline"]',
      icon: '📊',
      title: 'Track the Pipeline',
      intro: 'See every candidate\'s stage — sourced, screening, submitted, offered. The Pipeline view shows this visually.',
    },
  ],
  approvals: [
    {
      element: '[data-tour="approvals-pending"]',
      icon: '⏳',
      title: 'Pending Approvals',
      intro: 'Timesheets submitted by your team show up here. Review hours and approve or reject with a single click.',
    },
    {
      element: '[data-tour="approvals-history"]',
      icon: '📋',
      title: 'Approval History',
      intro: 'All past approved and rejected timesheets are stored here for your records.',
    },
  ],
};

let styleInjected = false;
function injectStyle() {
  if (styleInjected || document.getElementById('nexus-introjs-style')) return;
  const el = document.createElement('style');
  el.id = 'nexus-introjs-style';
  el.textContent = INTRO_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

/**
 * NexusTutorial — drop this into any page component.
 *
 * Props:
 *   page    — key from TOURS ('timesheet' | 'leads' | 'candidates' | 'approvals')
 *   autoRun — if true, runs automatically on first visit (default: true)
 *   delay   — ms to wait before auto-starting (default: 800)
 *
 * Also exposes a "?" button the user can click to replay the tutorial.
 */
export default function NexusTutorial({ page, autoRun = true, delay = 800 }) {
  const { hasSeenTutorial, markTutorialDone } = useTutorial();
  const [ready, setReady] = useState(false);
  const introRef = useRef(null);

  const steps = TOURS[page] || [];

  // Wait for intro.js CDN to load
  useEffect(() => {
    const check = () => { if (window.introJs) setReady(true); else setTimeout(check, 100); };
    check();
  }, []);

  const runTour = () => {
    if (!ready || !steps.length) return;
    injectStyle();

    const intro = window.introJs();
    introRef.current = intro;

    intro.setOptions({
      steps: steps.map((s, i) => ({
        element: document.querySelector(s.element) || undefined,
        intro: `
          <div class="nexus-tip-header">
            <div class="tip-icon">${s.icon}</div>
            <div>
              <div class="tip-step">Step ${i + 1} of ${steps.length}</div>
              <div class="tip-title">${s.title}</div>
            </div>
          </div>
          <p>${s.intro}</p>
        `,
        tooltipClass: 'nexus-tooltip',
      })),
      showProgress: true,
      showBullets: false,
      exitOnOverlayClick: false,
      nextLabel: i => i === steps.length - 1 ? 'Finish 🎉' : 'Next →',
      prevLabel: '← Back',
      skipLabel: 'Skip tour',
      doneLabel: 'Finish 🎉',
      scrollToElement: true,
      disableInteraction: false,
    });

    intro.oncomplete(() => markTutorialDone(page));
    intro.onexit(() => markTutorialDone(page));
    intro.start();
  };

  // Auto-run on first visit
  useEffect(() => {
	  if (!autoRun || !ready) return;
	  let cancelled = false;
	  hasSeenTutorial(page).then(seen => {
		if (!seen && !cancelled) {
		  const t = setTimeout(runTour, delay);
		  return () => clearTimeout(t);
		}
	  });
	  return () => { cancelled = true; introRef.current?.exit(true); };
	}, [ready, page]);

  if (!steps.length) return null;

  return (
    <button
      onClick={runTour}
      title="Show tutorial"
      style={{
        position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 999,
        width: 44, height: 44, borderRadius: '50%',
        background: 'linear-gradient(135deg, #004ac6, #2563eb)',
        color: '#fff', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,74,198,0.35)',
        fontSize: '1.125rem', fontWeight: 700,
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 6px 22px rgba(0,74,198,0.45)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,74,198,0.35)';
      }}
    >
      ?
    </button>
  );
}
