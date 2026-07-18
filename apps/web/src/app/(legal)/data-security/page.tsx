import {
	Shield,
	Lock,
	Database,
	Eye,
	FileCheck,
	Users,
	AlertCircle,
} from "lucide-react";
import { LegalPageLayout } from "../components/legal-page-layout";

export default function DataSecurityPage() {
	return (
		<LegalPageLayout title="Data Security" lastUpdated="July 17, 2026">
			<div className="space-y-8">
				<section>
					<p className="text-muted-foreground leading-relaxed mb-8">
						This page describes how OneTool actually protects your data: the
						security measures built into the application, and the
						infrastructure providers we rely on. We believe in describing our
						security honestly — what we do ourselves, what our providers do,
						and where responsibility sits with you.
					</p>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<Shield className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Infrastructure
							</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								OneTool is built on managed cloud infrastructure rather than
								servers we operate ourselves. Our providers maintain their own
								independent security programs and certifications:
							</p>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>Vercel</strong> hosts the web application and serves
									all traffic over HTTPS.
								</li>
								<li>
									<strong>Convex</strong> provides our database and file
									storage, with encryption at rest and automated backups
									managed by Convex.
								</li>
								<li>
									<strong>Clerk</strong> handles authentication — OneTool never
									stores or sees your password.
								</li>
								<li>
									<strong>Stripe</strong>, a PCI DSS Level 1 certified payment
									processor, handles all card and bank data. Full card numbers
									and bank credentials never touch OneTool&apos;s systems.
								</li>
							</ul>
							<p className="text-muted-foreground leading-relaxed mt-4">
								OneTool itself does not currently hold certifications such as
								SOC 2 or ISO 27001. Where our providers hold certifications,
								those apply to their services, not to OneTool as a whole.
							</p>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<Lock className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Encryption
							</h2>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>In Transit:</strong> All traffic between your browser
									or mobile device and OneTool is encrypted with HTTPS/TLS.
								</li>
								<li>
									<strong>At Rest:</strong> Data stored in our database and
									file storage is encrypted at rest by Convex, our
									infrastructure provider.
								</li>
								<li>
									<strong>Payment Data:</strong> Card and bank details are
									encrypted and held by Stripe; OneTool stores only card brand
									and last four digits, and bank name and last four digits for
									payout accounts.
								</li>
								<li>
									<strong>Portal Verification Codes:</strong> The one-time
									codes used for client portal sign-in are stored only as
									salted hashes, never in plain text.
								</li>
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<Users className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Authentication &amp; Access Control
							</h2>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>Sign-In:</strong> Authentication is handled by Clerk,
									including OAuth sign-in options. OneTool never stores
									passwords.
								</li>
								<li>
									<strong>Role-Based Access:</strong> Admins and members have
									different capabilities, with granular per-member permissions
									controlling access to areas of the Service.
								</li>
								<li>
									<strong>Organization Isolation:</strong> Every backend
									function verifies the caller&apos;s organization and scopes
									all reads and writes to it. Users cannot access another
									organization&apos;s data.
								</li>
								<li>
									<strong>Client Portal:</strong> Your clients sign in to their
									portal with a one-time email code. Portal sessions are
									short-lived, tracked server-side, and can be revoked — a
									stolen token alone is not enough to keep a session alive.
								</li>
								<li>
									<strong>Rate Limiting:</strong> Sensitive operations —
									portal sign-in codes, quote approvals, payment initiation,
									and public form submissions — are rate limited to slow abuse
									and brute-force attempts.
								</li>
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<Database className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Backups &amp; Data Deletion
							</h2>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>Backups:</strong> Database backups are managed by
									Convex as part of its platform. We recommend you also keep
									your own copies of critical business documents.
								</li>
								<li>
									<strong>Deletion:</strong> When you delete your organization
									or account, an automated cascade permanently removes your
									organization&apos;s records — clients, contacts, quotes,
									invoices, emails, documents — and deletes the underlying
									files (attachments, PDFs, signatures) from storage.
								</li>
								<li>
									<strong>Orphan Sweep:</strong> A daily automated job checks
									for and removes any data left behind by incomplete
									deletions.
								</li>
								<li>
									<strong>Provider Data:</strong> Data already held by our
									service providers (for example Stripe transaction records or
									signed documents in BoldSign) is retained under their
									policies; contact us if you need help requesting deletion
									from a provider.
								</li>
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<Eye className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Multi-Tenant Data Isolation
							</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								OneTool is multi-tenant: many businesses share the same
								infrastructure, isolated at the application layer.
							</p>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>Enforced Scoping:</strong> Every database query and
									mutation is filtered by organization ID. This is a hard
									requirement of our backend architecture, not a convention.
								</li>
								<li>
									<strong>Deny by Default:</strong> Requests without a valid
									authenticated organization context are rejected.
								</li>
								<li>
									<strong>Operational Access:</strong> Access to production
									data is limited to what is necessary to operate the Service
									and provide support.
								</li>
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<FileCheck className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Application Security Practices
							</h2>
							<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
								<li>
									<strong>Webhook Verification:</strong> Every inbound webhook
									(Clerk, Stripe, Resend, BoldSign) is cryptographically
									verified before processing; unverified requests are
									rejected.
								</li>
								<li>
									<strong>Content Sanitization:</strong> Inbound email HTML is
									sanitized before rendering to protect against injected
									scripts.
								</li>
								<li>
									<strong>Signature Audit Trail:</strong> Quote approvals are
									recorded append-only with the signed content snapshot,
									signer identity, IP address, and timestamp, so approval
									records cannot be silently altered.
								</li>
								<li>
									<strong>Dependency Updates:</strong> We keep dependencies
									updated and apply security patches as they become available.
								</li>
							</ul>
						</div>
					</div>
				</section>

				<section className="bg-card border border-border rounded-lg p-6">
					<div className="flex items-start gap-4">
						<div className="p-3 rounded-lg bg-primary/10">
							<AlertCircle className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h2 className="text-2xl font-semibold text-foreground mb-4">
								Service Providers
							</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								The full list of third-party providers we use, and what data
								each receives, is in our Privacy Policy. In summary: Clerk
								(authentication), Convex (database and storage), Vercel
								(hosting), Stripe (payments), Resend (email), BoldSign
								(e-signatures), PostHog (web analytics), OpenAI (AI features),
								Mapbox (address search), and Expo (mobile services).
							</p>
						</div>
					</div>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						Vulnerability Disclosure
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						We appreciate responsible security research. If you find a
						vulnerability:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Report it to support@onetool.biz with enough detail to reproduce
							it.
						</li>
						<li>
							Do not access or modify data that does not belong to you, and do
							not disrupt the Service.
						</li>
						<li>
							We will not pursue legal action against researchers acting in
							good faith within these guidelines.
						</li>
						<li>
							We will acknowledge your report, prioritize a fix based on
							severity, and coordinate disclosure with you.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						Security Incidents
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						If we become aware of a security incident affecting your data, we
						will investigate promptly, take steps to contain and remediate it,
						and notify affected customers without undue delay, consistent with
						applicable law. We will be transparent about what happened and what
						we are doing about it.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						Your Security Responsibilities
					</h2>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Use a strong, unique password for your account</li>
						<li>Keep your login credentials confidential</li>
						<li>
							Review who has access to your organization and remove members who
							no longer need it
						</li>
						<li>
							Report suspicious activity immediately to support@onetool.biz
						</li>
						<li>Keep your devices and browsers up to date</li>
						<li>
							Be cautious of phishing; verify URLs before entering credentials
						</li>
						<li>
							Keep your own copies of critical business documents and records
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						Questions or Concerns?
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						If you have questions about our security practices or want to
						report a security concern:
					</p>
					<div className="bg-card border border-border rounded-lg p-4 text-muted-foreground">
						<p className="font-semibold text-foreground mb-2">OneTool</p>
						<p>Email: support@onetool.biz</p>
					</div>
				</section>
			</div>
		</LegalPageLayout>
	);
}
