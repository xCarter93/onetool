import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

// Shared pool bounding all external-I/O side effects (push today; webhook/SMS
// later) so bursts can't monopolize the deployment's scheduled-function slots.
export const externalIoPool = new Workpool(components.externalIoPool, {
	maxParallelism: 10,
});
