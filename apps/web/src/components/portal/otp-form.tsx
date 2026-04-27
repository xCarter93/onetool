"use client";

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const emailSchema = z.string().email();

type Step = "email" | "code";

export interface OtpFormProps {
	businessName: string;
	clientPortalId: string;
	nextPath?: string;
	initialStep?: Step;
}

export default function OtpForm({
	businessName,
	clientPortalId,
	nextPath,
	initialStep = "email",
}: OtpFormProps) {
	const [step, setStep] = useState<Step>(initialStep);
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Server-authoritative attempts counter — populated from /api/portal/otp/verify response body.
	const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
		null,
	);
	const [resendCooldown, setResendCooldown] = useState(0);
	const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
	const toast = useToast();

	// Resend cooldown timer
	useEffect(() => {
		if (resendCooldown <= 0) {
			if (cooldownTimer.current) {
				clearInterval(cooldownTimer.current);
				cooldownTimer.current = null;
			}
			return;
		}
		if (!cooldownTimer.current) {
			cooldownTimer.current = setInterval(() => {
				setResendCooldown((s) => Math.max(0, s - 1));
			}, 1000);
		}
		return () => {
			if (cooldownTimer.current) {
				clearInterval(cooldownTimer.current);
				cooldownTimer.current = null;
			}
		};
	}, [resendCooldown]);

	async function requestOtp(targetEmail: string) {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/portal/otp/request", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ clientPortalId, email: targetEmail }),
			});
			if (res.status === 429) {
				const data = (await res.json().catch(() => ({}))) as {
					error?: string;
					retryAfter?: number;
				};
				const minutes =
					typeof data.retryAfter === "number"
						? Math.max(1, Math.ceil(data.retryAfter / 60))
						: 5;
				setError(`Too many requests. Try again in ${minutes} minutes.`);
				return false;
			}
			// Uniform-success per Pitfall 1: advance to step 2 even on non-200 to avoid enumeration.
			toast.success("Code sent");
			setStep("code");
			setCode("");
			setResendCooldown(60);
			return true;
		} catch {
			setError("Something went wrong. Please try again.");
			return false;
		} finally {
			setLoading(false);
		}
	}

	async function handleEmailSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		const parsed = emailSchema.safeParse(email);
		if (!parsed.success) {
			setError("Enter a valid email address.");
			return;
		}
		await requestOtp(email);
	}

	async function verifyCode(submittedCode: string) {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/portal/otp/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({
					clientPortalId,
					email,
					code: submittedCode,
					next: nextPath,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as {
				ok?: boolean;
				redirectTo?: string;
				error?: string;
				remainingAttempts?: number;
			};
			if (res.ok && data.ok && data.redirectTo) {
				// Full nav so middleware re-checks the new cookie and Convex picks up auth.
				window.location.assign(data.redirectTo);
				return;
			}
			if (res.status === 429) {
				setAttemptsRemaining(0);
				setError("Too many attempts. Request a new code to continue.");
				return;
			}
			if (typeof data.remainingAttempts === "number") {
				setAttemptsRemaining(data.remainingAttempts);
				if (data.remainingAttempts <= 0) {
					setError("Too many attempts. Request a new code to continue.");
				} else {
					const s = data.remainingAttempts === 1 ? "" : "s";
					setError(
						`That code didn't match. ${data.remainingAttempts} attempt${s} remaining.`,
					);
				}
				return;
			}
			// Uniform-error contract — single generic string for all failure modes per Plan 03/05.
			setError(data.error ?? "That code didn't match. Please try again.");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	function handleResend() {
		if (resendCooldown > 0 || loading) return;
		setAttemptsRemaining(null);
		void requestOtp(email);
	}

	function handleUseDifferentEmail() {
		setStep("email");
		setCode("");
		setError(null);
		setAttemptsRemaining(null);
	}

	const cellsDisabled = loading || attemptsRemaining === 0;

	if (step === "email") {
		return (
			<form
				onSubmit={handleEmailSubmit}
				className="flex flex-col gap-5 max-w-[460px] w-full"
				noValidate
			>
				<div>
					<h1 className="text-[24px] font-semibold leading-tight">
						Sign in to {businessName}
					</h1>
					<p className="text-sm text-muted-foreground mt-2">
						Enter your email and we&apos;ll send you a 6-digit code.
					</p>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="portal-otp-email">Email address</Label>
					<Input
						id="portal-otp-email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						disabled={loading}
					/>
				</div>

				{error ? (
					<p
						role="alert"
						aria-live="assertive"
						className="text-sm text-danger"
					>
						{error}
					</p>
				) : null}

				<Button
					type="submit"
					className="text-sm font-semibold"
					isDisabled={loading}
					isPending={loading}
				>
					{loading ? "Sending..." : "Send code"}
					{!loading ? (
						<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
					) : null}
				</Button>

				<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
					<ShieldCheck
						className="h-3.5 w-3.5 text-emerald-600"
						aria-hidden="true"
					/>
					<span>Secured by OneTool · Codes expire in 10 minutes</span>
				</div>
			</form>
		);
	}

	// Step 2: code entry
	return (
		<div className="flex flex-col gap-5 max-w-[460px] w-full">
			<div>
				<h1 className="text-[24px] font-semibold leading-tight">
					Enter your code
				</h1>
				<p className="text-sm text-muted-foreground mt-2">
					We sent a 6-digit code to {email}. The code expires in 10 minutes.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="portal-otp-code" className="sr-only">
					Verification code
				</Label>
				<InputOTP
					id="portal-otp-code"
					maxLength={6}
					value={code}
					onChange={(v) => setCode(v)}
					onComplete={(v) => {
						if (!cellsDisabled) void verifyCode(v);
					}}
					disabled={cellsDisabled}
					aria-label="Verification code"
					containerClassName="tabular-nums"
				>
					<InputOTPGroup>
						<InputOTPSlot index={0} className="h-[52px] w-[44px] text-lg" />
						<InputOTPSlot index={1} className="h-[52px] w-[44px] text-lg" />
						<InputOTPSlot index={2} className="h-[52px] w-[44px] text-lg" />
						<InputOTPSlot index={3} className="h-[52px] w-[44px] text-lg" />
						<InputOTPSlot index={4} className="h-[52px] w-[44px] text-lg" />
						<InputOTPSlot index={5} className="h-[52px] w-[44px] text-lg" />
					</InputOTPGroup>
				</InputOTP>
			</div>

			{error ? (
				<p
					role="alert"
					aria-live="assertive"
					className="text-sm text-danger"
				>
					{error}
				</p>
			) : null}

			{attemptsRemaining === 0 ? (
				<Button
					type="button"
					className="text-sm font-semibold"
					onPress={handleResend}
					isDisabled={loading}
					isPending={loading}
				>
					Send code
				</Button>
			) : (
				<Button
					type="button"
					className="text-sm font-semibold"
					onPress={() => verifyCode(code)}
					isDisabled={cellsDisabled || code.length !== 6}
					isPending={loading}
				>
					{loading ? "Verifying..." : "Verify and continue"}
				</Button>
			)}

			<div className="flex flex-col gap-2 items-start">
				<button
					type="button"
					className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
					onClick={handleResend}
					disabled={resendCooldown > 0 || loading}
				>
					{resendCooldown > 0
						? `Resend code (${resendCooldown}s)`
						: "Resend code"}
				</button>
				<button
					type="button"
					className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
					onClick={handleUseDifferentEmail}
					disabled={loading}
				>
					Use a different email
				</button>
			</div>

			<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
				<ShieldCheck
					className="h-3.5 w-3.5 text-emerald-600"
					aria-hidden="true"
				/>
				<span>Secured by OneTool · Codes expire in 10 minutes</span>
			</div>
		</div>
	);
}
