/**
 * Public surface of the domains feature for other modules (server-side).
 * The seller UI uses ./actions and ./components directly; platform code uses these.
 */
export { recheckDomainAsPlatform, runDomainMaintenance, type DomainCronSummary, type VerifyOutcome } from "./server/service";
export { checkCustomDomain, verificationRecordName, type DomainStatus, type SslStatus } from "./rules";
