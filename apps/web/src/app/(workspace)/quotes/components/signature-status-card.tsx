"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { FileSignature, FileText } from "lucide-react";
import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
} from "@/components/ui/accordion";
import { SignatureProgressBar } from "@/app/(workspace)/quotes/components/signature-progress-bar";
import { getSignatureDisplay } from "@/lib/signature-draft-display";

type SignatureStatus =
	| "Draft"
	| "Sent"
	| "Viewed"
	| "Signed"
	| "Completed"
	| "Declined"
	| "Revoked"
	| "Expired";

interface DocumentWithSignature {
	_id: string;
	version: number;
	generatedAt: number;
	boldsign: {
		status: SignatureStatus;
		sentAt?: number;
		viewedAt?: number;
		signedAt?: number;
		completedAt?: number;
		declinedAt?: number;
		revokedAt?: number;
		expiredAt?: number;
		draftSavedAt?: number;
		sentTo: Array<{
			name: string;
			email: string;
			signerType: string;
		}>;
	};
}

interface SignatureStatusCardProps {
	documentsWithSignatures?: DocumentWithSignature[] | null;
}

export function SignatureStatusCard({
	documentsWithSignatures,
}: SignatureStatusCardProps) {
	const hasSignatures =
		documentsWithSignatures && documentsWithSignatures.length > 0;

	return (
		<div className="rounded-lg border border-border bg-card">
			<Card className="bg-transparent border-none shadow-none ring-0">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-sm font-semibold">
						<FileText className="h-5 w-5" />
						Signature Status
					</CardTitle>
				</CardHeader>
				<CardContent>
					{hasSignatures ? (
						<Accordion>
							{documentsWithSignatures.map((doc) => {
								const {
									formattedDate,
									statusLabel,
									timestampLabel,
									recipientLabel,
								} = getSignatureDisplay(doc);

								return (
									<AccordionItem key={doc._id} value={doc._id}>
										<AccordionTrigger>
											{`Version ${doc.version} - ${statusLabel} - ${formattedDate}`}
										</AccordionTrigger>
										<AccordionContent>
											<div className="space-y-4">
												{/* Status badges at top of content */}
								<div className="flex items-center gap-3 pb-3 border-b border-border">
													<Badge variant="outline" className="text-xs">
														v{doc.version}
													</Badge>
													{doc.boldsign.status === "Completed" ? (
														<StatusBadge
															status="completed"
															appearance="solid"
															className="text-xs"
														>
															Completed
														</StatusBadge>
													) : (
														<StatusBadge
															status={doc.boldsign.status.toLowerCase()}
															className="text-xs"
														>
															{statusLabel}
														</StatusBadge>
													)}
									<span className="text-xs text-muted-foreground ml-auto">
														{timestampLabel}: {formattedDate}
													</span>
												</div>

												<SignatureProgressBar
													status={doc.boldsign.status}
													events={[
														{
															type: "Sent",
															timestamp: doc.boldsign.sentAt,
														},
														{
															type: "Viewed",
															timestamp: doc.boldsign.viewedAt,
														},
														{
															type: "Signed",
															timestamp: doc.boldsign.signedAt,
														},
														{
															type: doc.boldsign.status,
															timestamp:
																doc.boldsign.completedAt ||
																doc.boldsign.declinedAt ||
																doc.boldsign.revokedAt ||
																doc.boldsign.expiredAt,
														},
													]}
												/>

												{/* Recipients info */}
								<div className="pt-4 border-t border-border">
									<p className="font-semibold mb-3 text-sm text-foreground">
														{recipientLabel}
													</p>
													<ul className="space-y-2">
														{doc.boldsign.sentTo.map((recipient, i) => (
															<li
																key={i}
																className="flex items-center justify-between text-sm"
															>
													<span className="text-foreground">
																	<span className="font-medium">
																		{recipient.name}
																	</span>{" "}
													<span className="text-muted-foreground">
																		({recipient.email})
																	</span>
																</span>
																<Badge variant="outline" className="text-xs">
																	{recipient.signerType}
																</Badge>
															</li>
														))}
													</ul>
												</div>
											</div>
										</AccordionContent>
									</AccordionItem>
								);
							})}
						</Accordion>
					) : (
						<div className="p-8 border border-dashed border-border rounded-lg text-center">
							<FileSignature className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
							<h3 className="text-sm font-semibold text-foreground mb-2">
								No signature requests sent
							</h3>
							<p className="text-[13px] text-muted-foreground">
								Generate a PDF and send it to the client for signature
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
