/**
 * Preset interface -- defines the shape of each agent preset
 */

export interface PresetStep {
  prompt: string;
  category: string;
}

export interface Preset {
  name: string;
  description: string;
  /** Generate prompt steps for a single execution cycle */
  generateSteps(previousResult?: string): PresetStep[];
}
