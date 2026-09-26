/**
 * Shape of the legal-page content blocks (Terms of Use, Privacy Policy).
 *
 * The content lives as a literal object in each page and every section uses a
 * different subset of these fields, so the render code guards each one. The
 * fields are declared optional here to make that union explicit: without a
 * declared type, `Object.entries(...)` hands back a union of per-section
 * literal types and every guarded access is an error on the members that lack
 * the field.
 */
export interface LegalSubsection {
  title: string;
  items: readonly string[];
}

export interface LegalSection {
  title: string;
  /** Lead paragraph shown above any list or subsection. */
  intro?: string;
  /** Free-form paragraphs. */
  content?: readonly string[];
  /** Roman-numbered list. */
  items?: readonly string[];
  /** Titled groups of `items`, used where one section has several lists. */
  subsections?: readonly LegalSubsection[];
  /** Highlighted callout rendered after the body. */
  note?: string;
  /** Disclaimer-of-warranties block (Terms only). */
  warrantyHeader?: string;
  warranties?: readonly string[];
  /** Limitation-of-liability block (Terms only). */
  liabilityHeader?: string;
  liabilities?: readonly string[];
  limits?: readonly string[];
}

/** Prominent block rendered above the numbered sections (Terms only). */
export interface LegalDisclaimer {
  title: string;
  subtitle: string;
  intro: string;
  header: string;
  items: readonly string[];
}

interface LegalDocumentBase {
  title: string;
  lastUpdated: string;
  sections: Readonly<Record<string, LegalSection>>;
}

/** Privacy Policy: opens with the devnet notice. */
export interface PrivacyDocument extends LegalDocumentBase {
  devnetNotice: {
    title: string;
    content: string;
  };
}

/** Terms of Use: opens with the investment disclaimer. */
export interface TermsDocument extends LegalDocumentBase {
  disclaimer: LegalDisclaimer;
}
