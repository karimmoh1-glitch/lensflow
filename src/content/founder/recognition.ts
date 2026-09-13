/**
 * Recognition, by kind. Only entries Karim has stated or that can be verified. Empty kinds
 * render nothing — no "coming soon" placeholders.
 */

export type RecognitionItem = {
  title: string;
  detail: string;
  /** Year, only when verified. */
  year: number | null;
  url: string | null;
};

export type Recognition = {
  press: RecognitionItem[];
  awards: RecognitionItem[];
  speaking: RecognitionItem[];
  interviews: RecognitionItem[];
};

export const recognition: Recognition = {
  press: [],
  awards: [{ title: "EdAI hackathon", detail: "Team placed second", year: null, url: null }],
  speaking: [],
  interviews: [],
};

export const RECOGNITION_LABELS: Record<keyof Recognition, string> = {
  press: "Press",
  awards: "Awards",
  speaking: "Speaking",
  interviews: "Interviews",
};

/** The kinds that have at least one entry, in display order. */
export function recognitionGroups(r: Recognition = recognition) {
  return (Object.keys(RECOGNITION_LABELS) as (keyof Recognition)[])
    .filter((k) => r[k].length > 0)
    .map((k) => ({ kind: k, label: RECOGNITION_LABELS[k], items: r[k] }));
}
