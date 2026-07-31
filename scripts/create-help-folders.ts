// Creates the Cloudinary folder tree for the help center media, so screenshots
// can be drag-dropped into the right place without hand-building 46 nested
// folders. Paths are derived from the articles themselves, so this can't drift
// from what the help center actually renders.
//
// Run: npx tsx scripts/create-help-folders.ts [--dry]
//
// Needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET —
// Admin API credentials from the Cloudinary console. Pass them inline, or keep
// them in a gitignored env file and run:
//   npx tsx --env-file=apps/web/.env.local scripts/create-help-folders.ts
// These are local-only: the app builds public delivery URLs and never calls
// Cloudinary server-side, so none of this belongs in Vercel.
import { readdirSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

const PREFIX = "OneTool/help";
const ARTICLES_DIR = join(__dirname, "..", "packages", "help-content", "articles");

interface MediaSlot {
	asset: string;
}
interface Article {
	slug: string;
	heroMedia?: MediaSlot;
	sections: { blocks: { type: string; asset?: string }[] }[];
}

async function folderPaths(): Promise<string[]> {
	const paths = new Set<string>();

	for (const file of readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".ts"))) {
		const mod = await import(pathToFileURL(join(ARTICLES_DIR, file)).href);
		for (const exported of Object.values(mod)) {
			if (!Array.isArray(exported)) continue;
			for (const article of exported as Article[]) {
				const assets = [
					...(article.heroMedia ? [article.heroMedia.asset] : []),
					...article.sections.flatMap((s) =>
						s.blocks.filter((b) => b.type === "media").map((b) => b.asset)
					),
				].filter((a): a is string => Boolean(a));
				// Folder is everything up to the descriptor; a descriptor with no
				// "/" sits at the prefix root and needs no folder.
				for (const asset of assets) {
					const cut = asset.lastIndexOf("/");
					if (cut > 0) paths.add(`${PREFIX}/${asset.slice(0, cut)}`);
				}
			}
		}
	}

	return [...paths].sort();
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing ${name}.`);
		process.exit(1);
	}
	return value;
}

async function main() {
	const dry = process.argv.includes("--dry");
	const paths = await folderPaths();

	if (dry) {
		paths.forEach((p) => console.log(p));
		console.log(`\n[dry run] ${paths.length} folders.`);
		return;
	}

	const cloud = requireEnv("CLOUDINARY_CLOUD_NAME");
	const auth = Buffer.from(
		`${requireEnv("CLOUDINARY_API_KEY")}:${requireEnv("CLOUDINARY_API_SECRET")}`
	).toString("base64");

	let created = 0;
	let existed = 0;
	let failed = 0;

	for (const path of paths) {
		const res = await fetch(
			`https://api.cloudinary.com/v1_1/${cloud}/folders/${path}`,
			{ method: "POST", headers: { Authorization: `Basic ${auth}` } }
		);

		if (res.ok) {
			console.log(`+ ${path}`);
			created++;
			continue;
		}

		const body = await res.text();
		// Re-running is expected; an existing folder is not an error. Cloudinary
		// has returned both shapes for this.
		if (res.status === 409 || (res.status === 400 && /exists/i.test(body))) {
			console.log(`= ${path}`);
			existed++;
			continue;
		}

		console.error(`✗ ${path} — ${res.status} ${body}`);
		failed++;
	}

	console.log(`\n${created} created, ${existed} already there, ${failed} failed.`);
	if (failed) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
