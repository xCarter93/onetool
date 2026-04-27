export default function PortalExpiredPage() {
	return (
		<div className="flex min-h-screen items-center justify-center p-8">
			<div className="text-center max-w-md">
				<h1 className="text-2xl font-semibold mb-3">
					This link is no longer valid
				</h1>
				<p className="text-sm text-muted-foreground">
					Please use the link from your most recent email to return to the
					portal.
				</p>
			</div>
		</div>
	);
}
