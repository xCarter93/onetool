import { AuthScreenShell } from "@/components/auth/AuthScreenShell";
import { SignInCard } from "@/components/auth/SignInCard";

// Custom sign-in host. Routing after auth is the layout's job: (auth)/_layout
// reacts to the active session and <Redirect>s — this screen owns no callback.
// The app is SIGN-IN ONLY (Apple 3.1.1) — account sign-up and business setup
// live in the web app. SignInCard carries the whole flow (email code +
// Apple/Google SSO on Clerk hooks); the shell provides the hero photo, scrim
// and glass card around it.
export default function AuthScreen() {
	return (
		<AuthScreenShell>
			<SignInCard />
		</AuthScreenShell>
	);
}
