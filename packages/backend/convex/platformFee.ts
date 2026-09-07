import { userQuery } from "./lib/factories";
import { centsToDollars } from "./lib/money";
import { platformFeeCents } from "./lib/platformFee";

export const get = userQuery({
	args: {},
	handler: () => ({ platformFeeDollars: centsToDollars(platformFeeCents()) }),
});
