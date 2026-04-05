/**
 * Centralized phase config — mirrors backend/constants/phases.js
 * Single source of truth for phase keys, labels, and allowed types.
 */

export const PHASE_CONFIG = {
  ideaPresentation: {
    label: 'Idea Presentation',
    allowedTypes: ['pdf', 'ppt', 'pptx'],
    required: [],
  },
  progress1: {
    label: 'Progress 1',
    allowedTypes: ['ppt', 'pptx', 'pdf'],
    required: ['ideaPresentation'],
  },
  progress2: {
    label: 'Progress 2',
    allowedTypes: ['ppt', 'pptx', 'pdf'],
    required: ['progress1'],
  },
  phase1Report: {
    label: 'Phase 1 Report',
    allowedTypes: ['pdf'],
    required: ['progress1', 'progress2'],
  },
  progress3: {
    label: 'Progress 3',
    allowedTypes: ['ppt', 'pptx', 'pdf'],
    required: ['phase1Report'],
  },
  progress4: {
    label: 'Progress 4',
    allowedTypes: ['ppt', 'pptx', 'pdf'],
    required: ['progress3'],
  },
  finalReport: {
    label: 'Final Report',
    allowedTypes: ['pdf'],
    required: ['progress3', 'progress4'],
  },
  finalDemo: {
    label: 'Final Demo',
    allowedTypes: ['mp4', 'mkv'],
    required: ['phase1Report'],        // 6_months: unlocks after phase1Report
    required_1year: ['finalReport'],   // 1_year: unlocks after finalReport
  },
  finalPpt: {
    label: 'Final PPT',
    allowedTypes: ['pdf', 'ppt', 'pptx'],
    required: ['finalDemo'],
  },
  codebook: {
    label: 'Codebook',
    allowedTypes: ['docs', 'docx', 'pdf', 'zip'],
    required: ['finalPpt'],
  },
  achievements: {
    label: 'Achievements',
    allowedTypes: ['pdf', 'txt', 'docs', 'docx'],
    // Special: Unlocks only after ALL previous phases are uploaded
    // This is handled by custom logic in MenteeDashboard isActive() function
    required: ['finalDemo'], // Placeholder - actual logic checks all previous phases
  },
};

const COMMON_PHASES = ['ideaPresentation', 'progress1', 'progress2', 'phase1Report'];

const PHASES_6_MONTHS = [...COMMON_PHASES, 'finalDemo', 'achievements'];

const PHASES_1_YEAR = [
  ...COMMON_PHASES,
  'progress3',
  'progress4',
  'finalReport',
  'finalDemo',
  'finalPpt',
  'codebook',
  'achievements',
];

/**
 * Returns ordered phase keys for a given duration.
 * @param {'6_months'|'1_year'} duration
 * @returns {string[]}
 */
export function getAllowedPhases(duration) {
  if (duration === '1_year') return PHASES_1_YEAR;
  return PHASES_6_MONTHS; // default / 6_months
}
