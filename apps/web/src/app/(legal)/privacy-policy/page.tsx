import { LegalPageLayout } from "../components/legal-page-layout";

export default function PrivacyPolicyPage() {
	return (
		<LegalPageLayout title="Privacy Policy" lastUpdated="July 17, 2026">
			<div className="space-y-8">
				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						1. Introduction
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						OneTool (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) provides
						a business management platform for small field-service businesses.
						This Privacy Policy describes what information we collect through
						our web and mobile applications and related services (the
						&quot;Service&quot;), how we use it, and the choices you have.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Two different kinds of personal information flow through OneTool,
						and we treat them differently:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4 mt-4">
						<li>
							<strong>Your account information</strong> — information about you
							and your team members (names, emails, login activity). For this
							data, OneTool decides how and why it is processed.
						</li>
						<li>
							<strong>Your business records</strong> — information you enter
							about your own clients and business (client contacts, addresses,
							quotes, invoices, emails, signatures). For this data, you and your
							organization control what is collected and why; we process it only
							to provide the Service to you.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						If you do not agree with the practices described here, please do not
						use the Service.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						2. Information We Collect
					</h2>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						2.1 Information You Provide Directly
					</h3>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Account Registration:</strong> Your name, email address,
							and organization details (business name, address, phone, website).
							Sign-in and account identity are handled by Clerk, our
							authentication provider.
						</li>
						<li>
							<strong>Business Records:</strong> Client and contact details
							(names, email addresses, phone numbers, job titles), property and
							service addresses, project and task details, quote and invoice
							line items, pricing, notes, and tags. When you enter an address,
							we may geocode it (via Mapbox) and store the resulting map
							coordinates.
						</li>
						<li>
							<strong>Email and Messages:</strong> Emails you send through the
							Service and inbound emails received at your organization&apos;s
							OneTool receiving address, including subject lines, full message
							bodies, sender and recipient details, and attachments; internal
							team chat messages and their attachments.
						</li>
						<li>
							<strong>Files:</strong> Documents, images, and CSV files you
							upload, generated quote and invoice PDFs, and signed documents.
						</li>
						<li>
							<strong>E-Signature Records:</strong> When a client approves a
							quote through the client portal, we record the signature (typed or
							drawn), the approver&apos;s name and email, the IP address and
							browser information of the device used to sign, a snapshot of the
							approved line items and terms, and timestamps. This creates a
							tamper-evident approval record.
						</li>
						<li>
							<strong>Payment Records:</strong> We store payment amounts, status,
							and limited card details (brand and last four digits only) and, for
							payout accounts, the bank name and last four digits of the account.
							Full card numbers and bank credentials are collected and held by
							Stripe, never by OneTool.
						</li>
					</ul>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						2.2 Information Collected Automatically
					</h3>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Usage Analytics (web app only):</strong> We use PostHog to
							understand how the web application is used. This includes pages
							visited, clicks and form interactions (autocapture), heatmap data,
							performance metrics, and application errors. Analytics is tied to
							your account (name, email, role, organization, and plan type) so
							we can understand usage per customer. PostHog receives your IP
							address as part of standard event delivery. We do not use session
							recording in our analytics configuration, and our mobile app
							contains no analytics.
						</li>
						<li>
							<strong>Log Data:</strong> Our hosting and backend providers
							(Vercel, Convex) generate standard server logs, including access
							times, requests, and error messages.
						</li>
						<li>
							<strong>Cookies and Local Storage:</strong> Authentication cookies
							set by Clerk, a session cookie for the client portal, and PostHog
							analytics identifiers (see Section 10).
						</li>
						<li>
							<strong>Location:</strong> We do not collect GPS location from your
							device. Map coordinates in the Service come from geocoding
							addresses you type in. The IP address recorded at quote signing
							implies an approximate location.
						</li>
					</ul>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						2.3 Mobile App
					</h3>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Push Notifications:</strong> If you enable notifications,
							we store your device push token, platform, and device name to
							deliver notifications.
						</li>
						<li>
							<strong>Camera and Photos:</strong> Used only when you choose to
							attach an image or document; we access only what you select.
						</li>
						<li>
							<strong>Face ID:</strong> Used on-device to keep you signed in.
							Biometric data never leaves your device and is never sent to us.
						</li>
					</ul>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						2.4 Information from Third Parties
					</h3>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Account and organization membership information from Clerk.
						</li>
						<li>
							Payment, payout, and dispute status from Stripe (including card
							brand/last four and bank name/last four).
						</li>
						<li>Signature status and signed documents from BoldSign.</li>
						<li>
							Email delivery events from Resend (delivered, bounced,
							complained), and inbound email content addressed to your
							organization&apos;s receiving address — including mail from
							senders who are not yet in your client list.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						3. How We Use Information
					</h2>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Service Delivery:</strong> To provide, maintain, and
							operate the Service and its features.
						</li>
						<li>
							<strong>Account Management:</strong> To authenticate users and
							manage organization access, roles, and permissions.
						</li>
						<li>
							<strong>Communication:</strong> To send transactional emails
							(billing notifications, signature requests, system alerts) and
							respond to support requests.
						</li>
						<li>
							<strong>Payment Processing:</strong> To process subscription
							payments and facilitate invoice payments to your business through
							Stripe.
						</li>
						<li>
							<strong>Product Improvement:</strong> To analyze how the web app
							is used, diagnose errors, and improve the Service.
						</li>
						<li>
							<strong>Security and Fraud Prevention:</strong> To detect and
							address abuse, unauthorized access, and technical issues,
							including rate limiting and webhook verification.
						</li>
						<li>
							<strong>Legal Compliance:</strong> To comply with legal
							obligations and enforce our Terms of Service.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We do not use your business records for advertising, and we do not
						sell personal information.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						4. AI Features
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						Some features of OneTool are powered by OpenAI&apos;s API:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>The AI assistant</strong> answers questions about your
							business data. To do this, relevant records from your organization
							— which can include client names, contact details, addresses,
							quotes, invoices, and the contents of email threads — are sent to
							OpenAI as context for generating responses.
						</li>
						<li>
							<strong>AI-assisted import and report generation</strong> send the
							data you provide for those features (such as CSV contents or your
							report request) to OpenAI.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Under OpenAI&apos;s API terms, data submitted via the API is not
						used to train OpenAI&apos;s models by default, and we have not opted
						in to training. OpenAI may retain API data for a limited period for
						abuse monitoring under its policies. AI features run only when you
						invoke them; if you do not use them, your data is not sent to
						OpenAI.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						5. How We Share Information
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						We do not sell or rent personal information. We share information
						only with the service providers that operate the Service
						(&quot;subprocessors&quot;), within your organization, and where
						required by law.
					</p>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						5.1 Service Providers
					</h3>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Clerk</strong> — authentication and organization
							management: your name, email, and sign-in activity.
						</li>
						<li>
							<strong>Convex</strong> — our database and file storage: all data
							stored in the Service.
						</li>
						<li>
							<strong>Vercel</strong> — web hosting and delivery: standard
							request data and server logs.
						</li>
						<li>
							<strong>Stripe</strong> — payment processing (including Stripe
							Connect payouts to your business): payment details, and identity
							information you provide during Stripe&apos;s onboarding.
						</li>
						<li>
							<strong>Resend</strong> — email sending and receiving: message
							content, recipient addresses, and delivery events.
						</li>
						<li>
							<strong>BoldSign</strong> — e-signatures: documents sent for
							signature and signer names and email addresses.
						</li>
						<li>
							<strong>PostHog</strong> — web analytics: usage events and your
							account identity (name, email, role, organization, plan), plus IP
							address on event delivery.
						</li>
						<li>
							<strong>OpenAI</strong> — AI features: the data described in
							Section 4, only when you use those features.
						</li>
						<li>
							<strong>Mapbox</strong> — address search and geocoding: the
							addresses you type into address fields.
						</li>
						<li>
							<strong>Expo</strong> — mobile app services and push notification
							delivery: device push tokens.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Each provider processes data under its own terms and privacy policy,
						and several hold their own security certifications (for example,
						Stripe is a PCI DSS Level 1 certified payment processor). We share
						with them only what is needed to provide their function.
					</p>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						5.2 Within Your Organization
					</h3>
					<p className="text-muted-foreground leading-relaxed">
						Data you create in your organization is visible to other members of
						your organization according to their role and permissions. Admins
						control membership and access.
					</p>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						5.3 Legal Requirements
					</h3>
					<p className="text-muted-foreground leading-relaxed">
						We may disclose information if required by law, court order, or
						government request, or when we believe in good faith that disclosure
						is necessary to protect the safety, rights, or property of OneTool,
						our users, or the public, or to enforce our Terms of Service.
					</p>

					<h3 className="text-xl font-semibold text-foreground mb-3 mt-6">
						5.4 Business Transfers
					</h3>
					<p className="text-muted-foreground leading-relaxed">
						If OneTool is involved in a merger, acquisition, or sale of assets,
						your information may be transferred as part of that transaction. We
						will provide notice where required by law.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						6. Data Security
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						We take reasonable technical and organizational measures to protect
						your information, described in more detail on our Data Security
						page:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Data is encrypted in transit (HTTPS/TLS) and encrypted at rest by
							our infrastructure providers.
						</li>
						<li>
							Authentication is handled by Clerk; passwords are never stored by
							OneTool.
						</li>
						<li>
							Every query and change is scoped to your organization — the
							application enforces organization-level isolation on all business
							data.
						</li>
						<li>
							Role-based permissions limit what members of your organization can
							see and do.
						</li>
						<li>
							Client portal access uses short-lived, server-revocable sessions
							with email verification codes, and sensitive endpoints are rate
							limited.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						No method of transmission or storage is completely secure, and we
						cannot guarantee absolute security. Please protect your login
						credentials and notify us immediately of any suspected unauthorized
						access.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						7. Data Retention and Deletion
					</h2>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>While your account is active:</strong> We retain your data
							so the Service can function. Cancelling a paid subscription does
							not delete your data; your account continues on the free plan.
						</li>
						<li>
							<strong>When you delete your organization or account:</strong>{" "}
							Deletion of your organization (available in your organization
							settings) or your account permanently deletes your
							organization&apos;s data from our database and file storage —
							including clients, contacts, quotes, invoices, emails,
							attachments, documents, and signatures. Deletion begins
							immediately and completes shortly after, with a daily automated
							job that sweeps for and removes any remaining records.
						</li>
						<li>
							<strong>Archived clients:</strong> Clients you archive are
							permanently deleted 7 days after archiving.
						</li>
						<li>
							<strong>Internal system logs:</strong> Automation execution logs
							are deleted after 30 days and internal change events after 7
							days.
						</li>
						<li>
							<strong>Data held by service providers:</strong> Our service
							providers retain data under their own policies. For example,
							Stripe retains transaction records to meet its legal obligations,
							BoldSign retains signed documents, Resend retains email logs, and
							analytics events already sent to PostHog are retained under
							PostHog&apos;s retention settings and are not automatically
							erased when you delete your account.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						If you want us to request deletion of data held by a service
						provider on your behalf, contact us and we will make reasonable
						efforts to do so.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						8. Your Rights and Choices
					</h2>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Access and Correction:</strong> You can view and edit
							nearly all of your data directly in the Service. For anything you
							cannot change yourself, contact us.
						</li>
						<li>
							<strong>Deletion:</strong> You can delete your organization from
							your organization settings (web) or delete your account from the
							mobile app, or contact us to request deletion. See Section 7 for
							what deletion covers.
						</li>
						<li>
							<strong>Copy of Your Data:</strong> The Service does not currently
							include a self-serve bulk export. If you need a copy of your data,
							contact us and we will provide it in a commonly used format
							within a reasonable time.
						</li>
						<li>
							<strong>Notifications:</strong> You can disable mobile push
							notifications in your device settings. Transactional emails are
							required to operate the Service.
						</li>
						<li>
							<strong>Analytics:</strong> You can block analytics using browser
							tools or content blockers without affecting core functionality.
							Our web app does not currently respond to &quot;Do Not
							Track&quot; browser signals.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We extend these rights to all users regardless of where you live. To
						exercise any of them, contact us using the details in Section 14. We
						may need to verify your identity before acting on a request, and we
						aim to respond within 30 days.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						9. Your Clients&apos; Information
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						The client contacts, addresses, emails, and signatures in your
						OneTool organization belong to your business relationship with your
						clients. You are responsible for having the right to enter that
						information into the Service, and we process it only on your behalf
						to provide the Service.
					</p>
					<p className="text-muted-foreground leading-relaxed">
						If one of your clients contacts us directly about their personal
						information, we will refer them to you, since you control that data.
						We will assist you in fulfilling access or deletion requests from
						your clients — deleting a client record in the Service removes that
						client&apos;s data, and Section 7 describes full deletion.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						10. Cookies and Similar Technologies
					</h2>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Essential:</strong> Authentication cookies set by Clerk to
							keep you signed in, and a secure, HTTP-only session cookie for the
							client portal (24-hour lifetime).
						</li>
						<li>
							<strong>Analytics:</strong> PostHog stores an anonymous identifier
							in cookies and local storage to associate usage events with your
							session and account.
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						You can control or delete cookies through your browser settings.
						Blocking essential cookies will prevent sign-in; blocking analytics
						cookies does not affect core functionality. We do not use
						advertising cookies.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						11. Children&apos;s Privacy
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						OneTool is a business tool and is not directed to children under 13.
						We do not knowingly collect personal information from children under
						13. If you believe we have, contact us and we will delete it.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						12. US State Privacy Laws
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						Several US states (including California, Virginia, Colorado,
						Connecticut, Texas, and Utah) have comprehensive privacy laws that
						grant residents rights such as access, correction, deletion, and
						opting out of the sale of personal information. Given OneTool&apos;s
						current size, many of these laws&apos; applicability thresholds may
						not yet apply to us — but as a matter of policy we extend the rights
						in Section 8 to all users, and:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>We do not sell or share personal information for advertising.</li>
						<li>We do not use personal information for targeted advertising.</li>
						<li>
							We will not discriminate against you for exercising any privacy
							right.
						</li>
					</ul>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						13. International Users
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						OneTool is operated from the United States and is designed for and
						marketed to US-based businesses. Your information is processed and
						stored in the United States. We do not target or market the Service
						to individuals in the European Union, United Kingdom, or other
						regions, and we do not claim compliance with the GDPR or similar
						non-US regimes. If you access the Service from outside the United
						States, you do so understanding that your data will be processed in
						the United States, and the rights in Section 8 are available to
						you.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						14. Contact Us
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						If you have questions or requests regarding this Privacy Policy or
						our data practices, contact us:
					</p>
					<div className="bg-card border border-border rounded-lg p-4 text-muted-foreground">
						<p className="font-semibold text-foreground mb-2">OneTool</p>
						<p>Email: support@onetool.biz</p>
						<p className="text-xs text-muted-foreground mt-4">
							We aim to respond to privacy requests within 30 days.
						</p>
					</div>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						15. Changes to This Policy
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						We may update this Privacy Policy as the Service or our practices
						change. We will post updates on this page with a new effective
						date, and for material changes we will make reasonable efforts to
						notify you (for example, by email or an in-app notice). Your
						continued use of the Service after changes take effect constitutes
						acceptance of the updated policy.
					</p>
				</section>

				<section className="pt-4 border-t border-border mt-8">
					<p className="text-xs text-muted-foreground">
						This Privacy Policy is effective as of July 17, 2026.
					</p>
				</section>
			</div>
		</LegalPageLayout>
	);
}
