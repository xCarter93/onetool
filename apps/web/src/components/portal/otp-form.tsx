"use client";

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { ArrowRight, ShieldCheck, Mail } from "lucide-react";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
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
	const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
		null,
	);
	const [resendCooldown, setResendCooldown] = useState(0);
	const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
	// Guards against double-submit: InputOTP onComplete and the button
	// click can both fire verifyCode before React commits loading=true.
	const verifyInFlight = useRef(false);
	const toast = useToast();

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
		if (verifyInFlight.current) return;
		verifyInFlight.current = true;
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
			setError(data.error ?? "That code didn't match. Please try again.");
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
			verifyInFlight.current = false;
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
				className="flex w-full max-w-[420px] flex-col gap-6"
				noValidate
			>
				<div>
					<h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
						Sign in to {businessName}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Enter your email and we&apos;ll send you a 6-digit code.
					</p>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label
						htmlFor="portal-otp-email"
						className="text-xs font-medium text-foreground"
					>
						Email address
					</Label>
					<Input
						id="portal-otp-email"
						type="email"
						autoComplete="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						disabled={loading}
						className="h-11"
					/>
				</div>

				{error ? (
					<p
						role="alert"
						aria-live="assertive"
						className="-mt-2 text-sm text-danger"
					>
						{error}
					</p>
				) : null}

				<button
					type="submit"
					disabled={loading}
					className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
				>
					{loading ? "Sending..." : "Send code"}
					{!loading ? (
						<ArrowRight className="h-4 w-4" aria-hidden="true" />
					) : null}
				</button>

				<div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
					<ShieldCheck
						className="h-3.5 w-3.5 text-emerald-600"
						aria-hidden="true"
					/>
					<span>Secured by OneTool · Codes expire in 10 minutes</span>
				</div>
			</form>
		);
	}

	return (
		<div className="flex w-full max-w-[420px] flex-col gap-6">
			<div>
				<h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
					Enter your code
				</h1>
				<p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
					<Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
					<span>
						We sent a 6-digit code to{" "}
						<span className="font-medium text-foreground">{email}</span>. The
						code expires in 10 minutes.
					</span>
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
					<InputOTPGroup className="gap-2">
						{[0, 1, 2, 3, 4, 5].map((i) => (
							<InputOTPSlot
								key={i}
								index={i}
								className="h-12 w-11 rounded-lg border-input text-base font-semibold"
							/>
						))}
					</InputOTPGroup>
				</InputOTP>
			</div>

			{error ? (
				<p
					role="alert"
					aria-live="assertive"
					className="-mt-2 text-sm text-danger"
				>
					{error}
				</p>
			) : null}

			<button
				type="button"
				onClick={() =>
					attemptsRemaining === 0 ? handleResend() : verifyCode(code)
				}
				disabled={
					attemptsRemaining === 0
						? loading
						: cellsDisabled || code.length !== 6
				}
				className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
			>
				{attemptsRemaining === 0
					? "Send a new code"
					: loading
						? "Verifying..."
						: "Verify and continue"}
			</button>

			<div className="flex flex-col items-start gap-1.5">
				<button
					type="button"
					className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
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

			<div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
				<ShieldCheck
					className="h-3.5 w-3.5 text-emerald-600"
					aria-hidden="true"
				/>
				<span>Secured by OneTool · Codes expire in 10 minutes</span>
			</div>
		</div>
	);
}
