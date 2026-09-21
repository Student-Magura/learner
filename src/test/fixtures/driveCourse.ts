import type { DriveFile } from '../../drive/api';

const FOLDER = 'application/vnd.google-apps.folder';

function folder(id: string, name: string): DriveFile {
  return { id, name, mimeType: FOLDER, trashed: false, durationSec: null };
}

function video(id: string, name: string, durationSec: number | null): DriveFile {
  return { id, name, mimeType: 'video/mp4', trashed: false, durationSec };
}

function junk(id: string, name: string): DriveFile {
  return { id, name, mimeType: 'application/octet-stream', trashed: false, durationSec: null };
}

export const ROOT_ID = 'root-course-fixture-000000000';

/**
 * Зліплено зі структури реального курсу: модулі з номерами, вкладені підрозділи,
 * mp4 у листках і .DS_Store у чотирьох папках.
 */
export const COURSE_LISTING: Record<string, DriveFile[]> = {
  [ROOT_ID]: [
    folder('m02', '02 - Feature Design'),
    folder('m01', '01 - Feature Opportunity Validation'),
    folder('m03', '03 - Порожній модуль'),
    junk('junk-root', '.DS_Store'),
  ],
  m01: [
    folder('m01s02', '2 - Validate & Communicate Opportunity'),
    folder('m01s01', '1 - Refine Business Value'),
    folder('m01s10', '10 - Пізній розділ'),
  ],
  m01s01: [
    video('v-funnel', 'Funnel Analysis.mp4', 600),
    video('v-value', 'Estimating Business Value.mp4', 900),
  ],
  m01s02: [video('v-comm', 'Communicating Opportunities.mp4', 300), junk('junk-s02', '.DS_Store')],
  m01s10: [video('v-late', 'Пізнє відео.mp4', null)],
  m02: [folder('m02s01', '1 - Constrained Divergence')],
  m02s01: [video('v-diverge', 'Constrained Divergence.mp4', 480), junk('junk-m02s01', '.DS_Store')],
  m03: [folder('m03s01', '1 - Тільки смітник')],
  // Порожня після фільтрації на два рівні вглиб: модуль має зникнути цілком.
  m03s01: [junk('junk-m03s01', '.DS_Store')],
};

export const ROOT_FILE: DriveFile = folder(ROOT_ID, 'Product Management Course');
