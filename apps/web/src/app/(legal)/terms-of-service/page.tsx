import { LegalPageLayout } from "../components/legal-page-layout";

export default function TermsOfServicePage() {
	return (
		<LegalPageLayout title="Terms of Service" lastUpdated="July 17, 2026">
			<div className="space-y-8">
				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						1. Acceptance of Terms
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						These Terms of Service (&quot;Terms&quot;) constitute a legally
						binding agreement between you and OneTool (&quot;Company,&quot;
						&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) regarding your
						access to and use of our web application, mobile applications, and
						related services (collectively, the &quot;Service&quot;). By
						accessing, browsing, or using OneTool in any manner, you acknowledge
						that you have read, understood, and agree to be bound by these
						Terms. If you do not agree to these Terms in their entirety, you
						must discontinue use of the Service immediately.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						2. Service Description
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool is a business management platform designed specifically for
						small field-service businesses, including but not limited to
						cleaning, landscaping, HVAC, and trades. The Service provides tools
						for:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Client and contact management with property tracking</li>
						<li>
							Project and task management with scheduling and calendar views
						</li>
						<li>
							Quote creation and management with e-signature capability via
							BoldSign
						</li>
						<li>
							Invoice management with flexible payment splitting and tracking
						</li>
						<li>Email communication and threading with client records</li>
						<li>Analytics and reporting for business insights</li>
						<li>
							AI-powered features, including an assistant and report
							generation (see our Privacy Policy for how these process data)
						</li>
						<li>CSV import functionality for bulk data migration</li>
						<li>Integration with Stripe for payment processing</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We provide the Service on an &quot;as-is&quot; and
						&quot;as-available&quot; basis. We continuously work to improve the
						Service and add new features, but do not guarantee that specific
						functionalities will remain unchanged or available at all times.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						3. Accounts and Organization Management
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						When you create an account with OneTool, you must:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Provide accurate, current, and complete information</li>
						<li>Maintain and update your account information promptly</li>
						<li>
							Ensure that the email address associated with your account is
							accurate
						</li>
						<li>
							Maintain the security of your password and login credentials
						</li>
						<li>
							Accept responsibility for all activities that occur under your
							account
						</li>
						<li>
							Immediately notify us of any unauthorized use of your account
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Your account is created through Clerk, our authentication provider.
						You are responsible for maintaining the confidentiality of your
						credentials. OneTool is accessed through organizations, which serve
						as the primary boundary for data access and management. Organization
						owners and administrators must ensure that team members and
						contractors with access to your organization account are authorized
						and trustworthy. You acknowledge that you are solely responsible for
						managing access within your organization.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						4. User Content and Data Ownership
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						You retain all rights to content you create within OneTool,
						including:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Client information (contacts, properties, communication history)
						</li>
						<li>Project details and descriptions</li>
						<li>Quotes and invoices</li>
						<li>Tasks and schedules</li>
						<li>Custom reports and analytics</li>
						<li>Uploaded files and documents</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						By using OneTool, you grant us a limited, non-exclusive, worldwide,
						royalty-free license to store, process, and use your data solely to
						provide the Service, improve our platform, and comply with legal
						obligations. We will not sell, rent, or share your business data
						with third parties for their independent use without your explicit
						written consent, except as required by law or as necessary to
						operate the Service through our third-party providers (as detailed
						in our Privacy Policy).
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						You are responsible for ensuring you have the legal right to input
						any client data, including personally identifiable information (PII)
						from your clients, into OneTool. You represent and warrant that you
						have obtained all necessary permissions and consents from your
						clients to store and process their information through the Service.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						5. Acceptable Use and Prohibited Conduct
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						You agree to use OneTool only for lawful purposes and in a way that
						does not infringe upon the rights of others or restrict their use
						and enjoyment of the Service. Prohibited behavior includes:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Harassing, threatening, or intimidating any person</li>
						<li>
							Posting, uploading, or transmitting offensive, abusive, or obscene
							content
						</li>
						<li>Engaging in any form of spam or unsolicited messaging</li>
						<li>
							Attempting to gain unauthorized access to any portion of the
							Service
						</li>
						<li>
							Disrupting the normal flow of communication within the Service
						</li>
						<li>
							Reverse engineering, decompiling, or attempting to discover the
							source code of the Service
						</li>
						<li>
							Removing or altering any proprietary notices, labels, or marks on
							the Service
						</li>
						<li>
							Selling, trading, or transferring your account without our written
							consent
						</li>
						<li>
							Using the Service for illegal activities or in violation of any
							applicable laws
						</li>
						<li>
							Interfering with or disrupting the infrastructure or servers of
							the Service
						</li>
						<li>
							Using automated tools (bots, scrapers, crawlers) to access the
							Service without written authorization
						</li>
						<li>
							Impersonating any person or entity, or falsely representing your
							affiliation with any person or entity
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We reserve the right to investigate violations of these Terms and
						may take any legal action we deem appropriate, including immediate
						suspension or termination of your account.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						6. Subscription Plans and Pricing
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool offers multiple subscription tiers:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Free Plan:</strong> Limited features including up to 10
							clients, 3 active projects per client, and 5 e-signatures per
							month
						</li>
						<li>
							<strong>Business Plan:</strong> Unlimited clients, projects, and
							e-signatures, plus Stripe Connect integration and AI-powered CSV
							import
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Pricing is displayed on our website and is subject to change with 30
						days&apos; written notice. You will be notified of any price changes
						via email. Continuing to use the Service after a price change
						constitutes your acceptance of the new pricing. All prices are
						stated in USD unless otherwise specified.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						7. Billing, Payment, and Renewal
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						For paid subscription plans:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Billing occurs on a monthly or annual basis, depending on your
							selected plan
						</li>
						<li>You will be charged in advance of the service period</li>
						<li>Payment is processed through Stripe, our payment processor</li>
						<li>
							You authorize us to charge the payment method on file for all
							subscription fees
						</li>
						<li>
							Subscription renews automatically at the end of each billing
							period unless cancelled
						</li>
						<li>
							Failed payments may result in service suspension after notice and
							opportunity to cure
						</li>
						<li>
							All charges are non-refundable except as explicitly stated in
							Section 8 below
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						You are responsible for providing accurate billing information and
						promptly updating payment methods if they expire or are no longer
						valid. We are not responsible for failed charges due to expired or
						invalid payment information on file.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						8. Cancellation and Refunds
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						You may cancel your subscription at any time through your account
						settings or by contacting support@onetool.biz. Cancellation terms
						are as follows:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Your subscription will be cancelled at the end of your current
							billing period
						</li>
						<li>
							You will retain access to paid features until the end of that
							billing period
						</li>
						<li>
							Cancelling a paid subscription does not delete your data — your
							account continues on the free plan with your data intact
						</li>
						<li>
							If you want your data permanently deleted, delete your
							organization from your organization settings or contact us (see
							Section 20)
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We generally do not offer refunds for subscription fees, as the
						Service is provided continuously throughout your billing period.
						However, if you believe we have made a billing error, please contact
						us within 30 days of the erroneous charge. We reserve the right to
						issue refunds or credits at our sole discretion in cases of genuine
						billing mistakes or Service failures affecting your use.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						If you reside in the European Union, you may have the right to
						cancel within 14 days of your initial purchase without penalty
						(withdrawal rights).
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						9. Payment Processing and Stripe Connect
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool integrates with Stripe and Stripe Connect to facilitate
						payment processing:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Subscription payments are processed through Stripe</li>
						<li>
							Invoice payments from your clients are processed through Stripe
							Checkout
						</li>
						<li>
							With Stripe Connect, payments go directly to your
							organization&apos;s Stripe account
						</li>
						<li>
							OneTool may deduct platform fees from invoice payments as
							disclosed in your subscription plan
						</li>
						<li>
							Payment processing is subject to Stripe&apos;s Terms of Service
							and Privacy Policy
						</li>
						<li>
							You agree to comply with Stripe&apos;s acceptable use policies
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						You are responsible for ensuring compliance with all applicable laws
						regarding payment processing in your jurisdiction. OneTool does not
						directly process or store full credit card information; this is
						handled securely by Stripe, a PCI DSS compliant payment processor.
						You acknowledge that Stripe may block or decline payments in certain
						circumstances for compliance or fraud prevention reasons, and
						OneTool is not liable for payment processing failures.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						10. E-Signatures and BoldSign Integration
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool integrates with BoldSign to provide e-signature
						functionality:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							E-signatures created through BoldSign are legally binding digital
							signatures
						</li>
						<li>Free plan includes up to 5 e-signatures per calendar month</li>
						<li>Business plan includes unlimited e-signatures</li>
						<li>
							You are responsible for ensuring appropriate disclosures to
							clients regarding electronic signatures
						</li>
						<li>
							Signed documents are stored securely and remain accessible in your
							account for record-keeping
						</li>
						<li>
							E-signature usage is reset monthly and does not carry over between
							billing periods
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						By using e-signature functionality, you represent that you have the
						authority to request signatures on documents and that you comply
						with all applicable laws regarding electronic signatures and
						document execution in your jurisdiction. You agree that e-signatures
						created through this integration comply with the Electronic
						Signatures in Global and National Commerce Act (E-SIGN Act) and
						similar state and international laws.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						The use of BoldSign is subject to BoldSign&apos;s Terms of Service
						and Privacy Policy, and any disputes regarding the legality or
						validity of e-signatures should be directed to BoldSign as the
						signing platform provider.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						11. Third-Party Services and Integrations
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool integrates with and relies on several third-party services:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							<strong>Clerk:</strong> User authentication and organization
							management
						</li>
						<li>
							<strong>Convex:</strong> Real-time database and backend services
						</li>
						<li>
							<strong>Stripe:</strong> Payment processing and Stripe Connect for
							direct payment collection
						</li>
						<li>
							<strong>BoldSign:</strong> E-signature and digital document
							signing
						</li>
						<li>
							<strong>Resend:</strong> Email delivery and inbound email
							processing
						</li>
						<li>
							<strong>PostHog:</strong> Product analytics and usage tracking
						</li>
						<li>
							<strong>OpenAI:</strong> AI-powered features including CSV import
							and report generation
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Your use of these third-party services is governed by their
						respective terms and privacy policies. We are not responsible for
						third-party services or their interruptions, availability, or
						conduct. If any third-party service becomes unavailable, we may
						suspend certain features of OneTool. We recommend reviewing the
						privacy policies and terms of these third parties to understand how
						your data is handled.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Links to third-party websites and services are provided for
						convenience only. We do not endorse or assume responsibility for any
						third-party content, products, or services.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						12. Intellectual Property Rights
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						OneTool and all of its content, features, and functionality are
						owned by OneTool, its licensors, or other providers of such content.
						The Service is protected by copyright, trademark, and other
						intellectual property laws. You agree that:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							You will not copy, modify, or distribute any part of the Service
						</li>
						<li>
							You will not use any robots, spiders, or automated tools to access
							the Service without permission
						</li>
						<li>
							You will not attempt to gain unauthorized access to restricted
							areas of the Service
						</li>
						<li>
							You will not breach or circumvent any authentication or security
							mechanisms
						</li>
						<li>
							The license granted to you is limited to a personal,
							non-exclusive, non-transferable right to use the Service
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Any breach of these intellectual property restrictions may result in
						legal action and immediate termination of your account without
						refund.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						13. Limitation of Liability
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						To the fullest extent permitted by applicable law, in no event shall
						OneTool, its directors, officers, employees, agents, or licensors be
						liable for any indirect, incidental, special, consequential, or
						punitive damages, including but not limited to:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Loss of profits, revenue, data, or use</li>
						<li>Business interruption or loss of business opportunity</li>
						<li>Loss of goodwill or reputation</li>
						<li>Damages arising from errors, bugs, or technical failures</li>
						<li>
							Damages arising from unauthorized access to or alteration of your
							data
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						This applies regardless of whether such damages arise from breach of
						warranty, breach of contract, negligence, strict liability, or any
						other legal theory, and even if OneTool has been advised of the
						possibility of such damages.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Our total liability to you for all claims arising from or relating
						to the Service shall not exceed the amount you paid to us in the 12
						months preceding the claim, or $100, whichever is less. Some
						jurisdictions do not allow limitations on liability, so this
						limitation may not apply to you.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						14. Indemnification
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						You agree to indemnify, defend, and hold harmless OneTool and its
						officers, directors, employees, agents, and licensors from any
						claims, damages, liabilities, costs, and expenses (including
						reasonable attorneys&apos; fees) arising from or related to: (a)
						your use of the Service; (b) your violation of these Terms; (c) your
						content or user submissions; (d) your violation of any third-party
						rights; or (e) your violation of any applicable laws. We reserve the
						right to assume the exclusive defense of any third-party claim
						subject to indemnification, provided we give you written notice and
						opportunity to participate in defense.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						15. Disclaimers
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						The Service is provided on an &quot;as-is&quot; and
						&quot;as-available&quot; basis. To the fullest extent permitted by
						law, we disclaim all warranties, express or implied, including:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Implied warranties of merchantability, fitness for a particular
							purpose, or non-infringement
						</li>
						<li>
							Warranties regarding the accuracy, completeness, or reliability of
							the Service
						</li>
						<li>Warranties regarding uninterrupted or error-free service</li>
						<li>
							Any warranty that the Service will meet your specific business
							requirements
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						We do not warrant that defects in the Service will be corrected, or
						that the Service or its servers are free of viruses or other harmful
						components. Your use of the Service is at your own risk.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						16. Dispute Resolution and Arbitration
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						Any dispute, claim, or controversy arising from or relating to these
						Terms or the Service shall be resolved by binding arbitration
						administered by the American Arbitration Association (AAA) under its
						Commercial Arbitration Rules, rather than in court litigation,
						except that:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>You may bring claims in small claims court if they qualify</li>
						<li>
							Either party may seek injunctive relief in court to prevent
							irreparable harm
						</li>
						<li>
							Users in the European Union may pursue claims in their local
							courts
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						By agreeing to arbitration, you are waiving your right to a jury
						trial and your right to participate in a class action lawsuit. The
						arbitration shall be conducted on an individual basis (not as a
						class, consolidated, or representative action). Arbitration shall be
						conducted in the state or country where you reside, or as mutually
						agreed by the parties.
					</p>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Before pursuing arbitration, you agree to attempt to resolve
						disputes informally by contacting us at support@onetool.biz with
						written notice of the dispute.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						17. Data Backup and Responsibility
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						While OneTool maintains backups of your data, we recommend that you
						maintain your own independent backups of critical business
						information. OneTool is not liable for any loss of data due to
						technical failures, errors, or service disruptions. You are solely
						responsible for maintaining adequate backups of your data. In the
						event of data loss, we will make reasonable efforts to restore from
						backups, but we cannot guarantee recovery of all data or recovery
						within any specific timeframe.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						18. Service Availability and Downtime
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						While we strive for high availability, we do not guarantee
						uninterrupted service. OneTool may be unavailable due to:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>Planned maintenance (we provide notice when possible)</li>
						<li>Emergency maintenance for security or stability</li>
						<li>
							Third-party service interruptions (Convex, Stripe, Clerk, Resend,
							etc.)
						</li>
						<li>Technical failures or infrastructure issues</li>
						<li>Natural disasters or force majeure events</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						During scheduled maintenance, we will make reasonable efforts to
						notify users in advance. We are not liable for losses or damages
						resulting from service interruptions.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						19. Termination and Suspension
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						We may suspend or terminate your account and access to the Service,
						immediately and without notice, if:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>You violate these Terms</li>
						<li>
							Your account is used for illegal, fraudulent, or harmful purposes
						</li>
						<li>
							You engage in abusive behavior toward our team or other users
						</li>
						<li>
							Your payment fails and remains unresolved for more than 30 days
						</li>
						<li>We determine that continued operation poses a security risk</li>
						<li>We cease offering the Service or your subscription plan</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Upon termination, all licenses and rights to use the Service will
						immediately cease. We will provide reasonable notice in most
						circumstances, except where termination is necessary to prevent harm
						or comply with legal requirements. Upon account or organization
						deletion, your data is permanently deleted as described in our
						Privacy Policy. If your account is suspended or terminated by us,
						you may contact us to request a copy of your data before deletion.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						20. Data Portability and Export
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						The Service does not currently include a self-serve bulk export
						feature. You may request a copy of your data at any time by
						contacting support@onetool.biz, and we will provide it in a
						commonly used format within a reasonable time. When you delete
						your organization or account, your data is permanently deleted
						from our systems as described in our Privacy Policy — please
						request any copy you need before deleting.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						21. Modifications to Terms
					</h2>
					<p className="text-muted-foreground leading-relaxed mb-4">
						We reserve the right to modify these Terms at any time. We will
						notify you of material changes by:
					</p>
					<ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
						<li>
							Posting the updated Terms on this page with an updated effective
							date
						</li>
						<li>
							Making reasonable efforts to notify you in advance of material
							changes (for example, by email or an in-app notice)
						</li>
					</ul>
					<p className="text-muted-foreground leading-relaxed mt-4">
						Your continued use of the Service following notice of changes
						constitutes your acceptance of the modified Terms. If you do not
						agree with any modifications, you must stop using the Service and
						cancel your account.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						22. Severability
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						If any provision of these Terms is found to be invalid, illegal, or
						unenforceable by a court of competent jurisdiction, that provision
						shall be severed, and the remaining provisions shall continue in
						full force and effect to the maximum extent permitted by law.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						23. Entire Agreement
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						These Terms, together with our Privacy Policy and Data Security
						Policy, constitute the entire agreement between you and OneTool
						regarding the Service and supersede all prior agreements,
						understandings, and negotiations, whether written or oral. If you
						have executed a separate written agreement with OneTool (such as an
						enterprise agreement), that agreement will control to the extent of
						any conflict with these Terms.
					</p>
				</section>

				<section>
					<h2 className="text-2xl font-semibold text-foreground mb-4">
						24. Contact Information
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						If you have questions, concerns, or disputes regarding these Terms
						of Service, please contact us at:
					</p>
					<div className="bg-card border border-border rounded-lg p-4 mt-4 text-muted-foreground">
						<p className="font-semibold text-foreground mb-2">
							OneTool Legal Support
						</p>
						<p>Email: support@onetool.biz</p>
					</div>
				</section>

				<section className="pt-4 border-t border-border mt-8">
					<p className="text-xs text-muted-foreground">
						These Terms of Service are effective as of July 17, 2026. Please
						review this document regularly as we may update it. Your continued
						use of OneTool constitutes acceptance of these terms.
					</p>
				</section>
			</div>
		</LegalPageLayout>
	);
}
