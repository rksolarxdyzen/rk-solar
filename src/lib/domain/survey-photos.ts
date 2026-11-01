/** Optional site photos captured during digital survey → Docs tab. */

export const SURVEY_PHOTO_SLOTS = [
  {
    key: "gps",
    docType: "survey_gps",
    title: "GPS site photo",
    hint: "Geo-tagged photo of the site (use camera on location)",
  },
  {
    key: "roof",
    docType: "survey_roof",
    title: "Roof / terrace overview",
    hint: "Wide shot of the usable roof or terrace",
  },
  {
    key: "shadow",
    docType: "survey_shadow",
    title: "Shadow / obstacles",
    hint: "Shading, tanks, parapets, or other obstacles",
  },
  {
    key: "access",
    docType: "survey_access",
    title: "Access / structure",
    hint: "Stair access, mounting area, or structure detail",
  },
] as const;

export type SurveyPhotoKey = (typeof SURVEY_PHOTO_SLOTS)[number]["key"];
export type SurveyPhotoDocType = (typeof SURVEY_PHOTO_SLOTS)[number]["docType"];

export const SURVEY_PHOTO_DOC_TYPES = SURVEY_PHOTO_SLOTS.map((s) => s.docType);

export type SurveyPhotoUrls = Record<SurveyPhotoKey, string>;

export function isSurveyPhotoDocType(value: string): value is SurveyPhotoDocType {
  return (SURVEY_PHOTO_DOC_TYPES as readonly string[]).includes(value);
}
