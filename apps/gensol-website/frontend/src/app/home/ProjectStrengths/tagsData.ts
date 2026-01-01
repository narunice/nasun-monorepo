import { homeContent } from '@/constants/pageContent/homeContent';

const { tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8 } = homeContent.projectStrengths;

// Desktop tag positions and animation settings
export const desktopTags = [
  { data: tag1, position: { x: '35%', y: '15%' }, index: 0, delay: 0, duration: 5, size: 3.5 },
  { data: tag2, position: { x: '65%', y: '15%' }, index: 1, delay: 0.8, duration: 6, size: 4.5 },
  { data: tag3, position: { x: '20%', y: '35%' }, index: 2, delay: 1.6, duration: 4, size: 3 },
  { data: tag4, position: { x: '80%', y: '35%' }, index: 3, delay: 1, duration: 6, size: 3.5 },
  { data: tag5, position: { x: '20%', y: '65%' }, index: 4, delay: 0.5, duration: 7, size: 4 },
  { data: tag6, position: { x: '80%', y: '65%' }, index: 5, delay: 1.2, duration: 4, size: 5 },
  { data: tag7, position: { x: '35%', y: '85%' }, index: 6, delay: 2.8, duration: 10, size: 5.5 },
  { data: tag8, position: { x: '65%', y: '85%' }, index: 7, delay: 3.4, duration: 5, size: 4 },
];

// Mobile tag pairs
export const mobileTagRows = [
  { leftTag: tag1, rightTag: tag2, delay: '0.4s', pulseDelay: 0 },
  { leftTag: tag3, rightTag: tag4, delay: '0.4s', pulseDelay: 0.4 },
  { leftTag: tag5, rightTag: tag6, delay: '0.5s', pulseDelay: 0.8 },
  { leftTag: tag7, rightTag: tag8, delay: '0.5s', pulseDelay: 0.2 },
];
