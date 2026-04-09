export type FindingSeverity = 'critical' | 'major' | 'minor';
export type FindingType    = 'ISSUE' | 'WARNING' | 'POSITIVE';
export type FindingStatus  = 'open' | 'patched' | 'dismissed';

export interface CompetitorEvidence {
  url: string;
  screenshotUrl: string;
  annotation: string; // one sentence: what the competitor does differently
}

export interface Finding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  status: FindingStatus;
  component: string;              // dot-separated path e.g. "hero.cta"
  title: string;                  // max 8 words
  description: string;
  principle: string;
  principleExplanation: string;
  recommendation: string;
  requiresCompetitorEvidence: boolean;
  competitorEvidence?: CompetitorEvidence[];
  annotation: { xPercent: number; yPercent: number };
}

export interface UXLabSession {
  id: string;
  url: string;
  page: string;
  beforeScreenshotUrl: string;
  afterScreenshotUrl: string;
  afterPreviewMessage?: string;
  findings: Finding[];
  createdAt: string;
  status: 'pending' | 'complete' | 'error';
}
