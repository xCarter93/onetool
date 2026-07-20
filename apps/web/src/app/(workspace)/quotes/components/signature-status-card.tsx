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
		<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
			<Card className="bg-transparent border-none shadow-none ring-0">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-xl">
						<FileText className="h-5 w-5" />
						Signature Status
					</CardTitle>
				</CardHeader>
				<CardContent>
					{hasSignatures ? (
						<Accordion>
							{documentsWithSignatures.map((doc) => {
								// Get the most recent timestamp for last update. A draft has
								// no signature events, so without draftSavedAt this falls
								// back to the PDF's generatedAt, which can be far older.
								const lastUpdate =
									doc.boldsign.completedAt ||
									doc.boldsign.declinedAt ||
									doc.boldsign.revokedAt ||
									doc.boldsign.expiredAt ||
									doc.boldsign.signedAt ||
									doc.boldsign.viewedAt ||
									doc.boldsign.sentAt ||
									doc.boldsign.draftSavedAt ||
									doc.generatedAt;

								const formattedDate = new Date(lastUpdate).toLocaleDateString(
									"en-US",
									{
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									}
								);

								return (
									<AccordionItem key={doc._id} value={doc._id}>
										<AccordionTrigger>
											{`Version ${doc.version} - ${doc.boldsign.status === "Draft" ? "Draft, not sent" : doc.boldsign.status} - ${formattedDate}`}
										</AccordionTrigger>
										<AccordionContent>
											<div className="space-y-4">
												{/* Status badges at top of content */}
												<div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
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
															{doc.boldsign.status === "Draft"
																? "Draft, not sent"
																: doc.boldsign.status}
														</StatusBadge>
													)}
													<span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
														{doc.boldsign.status === "Draft"
															? "Saved"
															: "Last updated"}
														: {formattedDate}
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
												<div className="pt-4 border-t border-gray-200 dark:border-gray-700">
													<p className="font-medium mb-3 text-sm text-gray-900 dark:text-white">
														{doc.boldsign.status === "Draft"
															? "Will be sent to:"
															: "Sent to:"}
													</p>
													<ul className="space-y-2">
														{doc.boldsign.sentTo.map((recipient, i) => (
															<li
																key={i}
																className="flex items-center justify-between text-sm"
															>
																<span className="text-gray-700 dark:text-gray-300">
																	<span className="font-medium">
																		{recipient.name}
																	</span>{" "}
																	<span className="text-gray-500 dark:text-gray-400">
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
						<div className="p-8 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg text-center">
							<FileSignature className="h-12 w-12 text-gray-400 mx-auto mb-3" />
							<h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">
								No signature requests sent
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400">
								Generate a PDF and send it to the client for signature
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
