/**
 * Centralized phase configuration for upload phases.
 * Used by both backend (validation) and can be mirrored on frontend.
 */

const PHASE_LABELS = {
  ideaPresentation: 'Idea Presentation',
  progress1:        'Progress 1',
  progress2:        'Progress 2',
  phase1Report:     'Phase 1 Report',
  progress3:        'Progress 3',
  progress4:        'Progress 4',
  finalReport:      'Final Report',
  finalDemo:        'Final Demo',
  finalPpt:         'Final PPT',
  codebook:         'Codebook',
  achievements:     'Achievements',
};

const COMMON_PHASES = [
  'ideaPresentation',
  'progress1',
  'progress2',
  'phase1Report',
];

const PHASES_6_MONTHS = [
  ...COMMON_PHASES,
  'finalDemo',
  'achievements',
];

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
 * Returns the allowed phase keys for a given project duration.
 * @param {'6_months'|'1_year'} duration
 * @returns {string[]}
 */
function getAllowedPhases(duration) {
  if (duration === '1_year') return PHASES_1_YEAR;
  if (duration === '6_months') return PHASES_6_MONTHS;
  // Default fallback: treat as 6_months for backward compat
  return PHASES_6_MONTHS;
}

module.exports = { PHASE_LABELS, PHASES_6_MONTHS, PHASES_1_YEAR, getAllowedPhases };
