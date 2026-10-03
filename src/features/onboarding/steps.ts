/**
 * Seller onboarding steps (pure, unit tested). Account creation happens before /onboarding, so
 * it is always shown as done. Progress is derived from the database (an owned draft store means
 * onboarding is in progress), so it survives sign-out, other devices and email verification.
 */
export const ONBOARDING_STEPS = [
  { key: "account", label: "Account" },
  { key: "business", label: "Business" },
  { key: "theme", label: "Theme" },
  { key: "plan", label: "Plan" },
  { key: "ready", label: "Ready" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];
export type WizardStep = Exclude<OnboardingStepKey, "account">;

const WIZARD: readonly WizardStep[] = ["business", "theme", "plan", "ready"];

export function isWizardStep(v: unknown): v is WizardStep {
  return typeof v === "string" && (WIZARD as readonly string[]).includes(v);
}

/**
 * The step to show. Without a store only "business" is possible; with one, the requested step
 * (default "theme"). "business" with a store means editing details via Back.
 */
export function resolveStep(requested: unknown, hasStore: boolean): WizardStep {
  if (!hasStore) return "business";
  return isWizardStep(requested) ? requested : "theme";
}

export function stepIndex(step: OnboardingStepKey): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === step);
}

export function previousStep(step: WizardStep): WizardStep | null {
  const i = WIZARD.indexOf(step);
  return i > 0 ? WIZARD[i - 1]! : null;
}

/** URL of an onboarding step for a store, carrying the sign-up choices along. */
export function onboardingHref(step: WizardStep, store?: string | null, choice: { plan?: string | null; theme?: string | null } = {}): string {
  const qs = new URLSearchParams();
  if (step !== "business" || store) qs.set("step", step);
  if (store) qs.set("store", store);
  if (choice.plan) qs.set("plan", choice.plan);
  if (choice.theme) qs.set("theme", choice.theme);
  return qs.size ? `/onboarding?${qs}` : "/onboarding";
}

export const PLAN_CODE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A plan code shape check only; the code must still be found among active plans. */
export function cleanPlanCode(v: unknown): string | null {
  return typeof v === "string" && PLAN_CODE_RE.test(v) ? v : null;
}
