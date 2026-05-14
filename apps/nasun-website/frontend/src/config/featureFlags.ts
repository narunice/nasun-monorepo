export const NASUN_AI_ENABLED = import.meta.env.VITE_NASUN_AI_ENABLED === 'true';

// Returns the correct ecosystem path depending on the feature flag.
// Use this wherever a link to the Nasun AI / Baram page is needed.
export const ecosystemAiPath = NASUN_AI_ENABLED ? '/ecosystem/nasun-ai' : '/ecosystem/baram';
