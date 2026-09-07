// Read at call time so the deployment that charges the fee is the only source
// the Payments tab discloses.
export function platformFeeCents(): number {
	const cents = Number(process.env.STRIPE_APPLICATION_FEE_CENTS ?? 0);
	return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}
