import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";
import resend from "@convex-dev/resend/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();

// Define separate aggregates for different home stats metrics
app.use(aggregate, { name: "clientCounts" });
app.use(aggregate, { name: "projectCounts" });
app.use(aggregate, { name: "quoteCounts" });
app.use(aggregate, { name: "invoiceRevenue" });
app.use(aggregate, { name: "invoiceCounts" });

// Resend email integration
app.use(resend);

// Rate limiting
app.use(rateLimiter);

// Database migrations
app.use(migrations);

export default app;
