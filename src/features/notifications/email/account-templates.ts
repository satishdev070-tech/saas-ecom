/**
 * Account emails (sign-up confirmation, password reset, magic link, invite, email change,
 * re-authentication code) and super-admin account emails. PURE: every value is escaped by the
 * shared layout; links must be https (or http on localhost) or the button is dropped.
 */
import { escapeHtml } from "../templates";
import { renderLayout, renderLayoutText, type EmailBrand, type RenderedEmail } from "./layout";

export const AUTH_EMAIL_ACTIONS = ["signup", "recovery", "magiclink", "invite", "email_change", "email_change_new", "email", "reauthentication"] as const;
export type AuthEmailAction = (typeof AUTH_EMAIL_ACTIONS)[number];
export const isAuthEmailAction = (v: string): v is AuthEmailAction => (AUTH_EMAIL_ACTIONS as readonly string[]).includes(v);

type Copy = { subject: string; heading: string; body: string; cta: string; footnote: string };

function copyFor(action: AuthEmailAction, name: string): Copy {
  switch (action) {
    case "signup":
      return { subject: `Confirm your email for ${name}`, heading: "Confirm your email", body: `Thanks for signing up with ${name}. Confirm your email address to finish creating your account.`, cta: "Confirm email", footnote: "If you didn't create an account, you can ignore this email." };
    case "recovery":
      return { subject: `Reset your ${name} password`, heading: "Reset your password", body: "We received a request to reset your password. Use the button below to choose a new one. The link works once and expires soon.", cta: "Choose a new password", footnote: "If you didn't ask for this, you can ignore this email. Your password won't change." };
    case "magiclink":
    case "email":
      return { subject: `Your ${name} sign-in link`, heading: "Sign in", body: `Use the button below to sign in to ${name}. The link works once and expires soon.`, cta: "Sign in", footnote: "If you didn't try to sign in, you can ignore this email." };
    case "invite":
      return { subject: `You're invited to ${name}`, heading: "You're invited", body: `You've been invited to create an account on ${name}. Accept the invitation to set your password.`, cta: "Accept invitation", footnote: "If you weren't expecting this, you can ignore this email." };
    case "email_change":
    case "email_change_new":
      return { subject: `Confirm your new email for ${name}`, heading: "Confirm your new email", body: "Confirm this email address to finish changing the email on your account.", cta: "Confirm new email", footnote: "If you didn't ask to change your email, contact support straight away." };
    case "reauthentication":
      return { subject: `Your ${name} verification code`, heading: "Verification code", body: "Enter this code to confirm it's you.", cta: "", footnote: "If you didn't request a code, you can ignore this email." };
  }
}

function paragraphs(text: string): string {
  return text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`)
    .join("");
}

/** Supabase Auth email (sent by our Send Email hook through Resend). `otp` is shown when present. */
export function renderAuthEmail(d: { action: AuthEmailAction; brand: EmailBrand; actionUrl: string | null; otp?: string | null }): RenderedEmail {
  const c = copyFor(d.action, d.brand.storeName);
  const code = d.otp && /^[0-9A-Za-z]{4,12}$/.test(d.otp) ? d.otp : null;
  const bodyText = code ? `${c.body}\n\nYour code: ${code}` : c.body;
  const codeHtml = code ? `<p style="margin:0 0 16px;font-size:28px;letter-spacing:6px;font-weight:700;font-family:monospace">${escapeHtml(code)}</p>` : "";
  const layout = { brand: d.brand, heading: c.heading, preheader: c.subject, cta: c.cta && d.actionUrl ? { label: c.cta, url: d.actionUrl } : null, footnote: c.footnote };
  return { subject: c.subject, html: renderLayout({ ...layout, bodyHtml: paragraphs(c.body) + codeHtml }), text: renderLayoutText({ ...layout, bodyText }) };
}

/** Sent when platform support creates a store for someone (new account → set-password link). */
export function renderStoreCreatedEmail(d: { brand: EmailBrand; storeName: string; storeUrl: string; actionUrl: string; newAccount: boolean; ownerName?: string | null }): RenderedEmail {
  const subject = `Your store ${d.storeName} is ready`;
  const hello = d.ownerName ? `Hi ${d.ownerName},\n\n` : "";
  const bodyText = d.newAccount
    ? `${hello}We've created your store ${d.storeName} on ${d.brand.storeName} and an account for you.\n\nSet your password with the button below, then sign in to add products, choose your theme and start selling. Your store address is ${d.storeUrl}.`
    : `${hello}We've created a new store, ${d.storeName}, on your ${d.brand.storeName} account.\n\nOpen your dashboard to add products, choose your theme and start selling. Your store address is ${d.storeUrl}.`;
  const layout = {
    brand: d.brand,
    heading: `${d.storeName} is ready`,
    preheader: subject,
    cta: { label: d.newAccount ? "Set your password" : "Open your dashboard", url: d.actionUrl },
    footnote: d.newAccount ? "The link works once. If it expires, use “Forgot password” on the sign-in page." : "If you weren't expecting this, contact support.",
  };
  return { subject, html: renderLayout({ ...layout, bodyHtml: paragraphs(bodyText) }), text: renderLayoutText({ ...layout, bodyText }) };
}

/** Password reset started by platform support for a store account. */
export function renderAdminPasswordResetEmail(d: { brand: EmailBrand; storeName: string; actionUrl: string }): RenderedEmail {
  const subject = `Reset your ${d.brand.storeName} password`;
  const bodyText = `Our support team started a password reset for your account on ${d.storeName}.\n\nChoose a new password with the button below. The link works once and expires soon.`;
  const layout = { brand: d.brand, heading: "Reset your password", preheader: subject, cta: { label: "Choose a new password", url: d.actionUrl }, footnote: "If you didn't ask support for this, reply to this email or contact support." };
  return { subject, html: renderLayout({ ...layout, bodyHtml: paragraphs(bodyText) }), text: renderLayoutText({ ...layout, bodyText }) };
}

/** Sent after support sets a new password directly (the password itself is never emailed). */
export function renderPasswordChangedEmail(d: { brand: EmailBrand; storeName: string; signInUrl: string }): RenderedEmail {
  const subject = `Your ${d.brand.storeName} password was changed`;
  const bodyText = `Our support team set a new password for your account on ${d.storeName}, as requested. Sign in with the new password they gave you, then change it in your account settings.`;
  const layout = { brand: d.brand, heading: "Your password was changed", preheader: subject, cta: { label: "Sign in", url: d.signInUrl }, footnote: "If you didn't ask support for this, reset your password straight away and contact support." };
  return { subject, html: renderLayout({ ...layout, bodyHtml: paragraphs(bodyText) }), text: renderLayoutText({ ...layout, bodyText }) };
}
