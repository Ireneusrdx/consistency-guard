/**
 * Auth screens: login / register / forgot-password / reset-password.
 * Split layout with a marketing panel on desktop and a form card on the right.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button, Input, Badge, ErrorState, Field, Icon, Checkbox, toast } from '../components/ui';
import { PageTransition } from '../components/PageTransition';
import { fadeOnly, springDefault, usePrefersReducedMotion } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { authApi, toApiError } from '../lib/api';
import logoUrl from '../assets/logo.svg';

type AuthProps = { mode: 'login' | 'register' | 'forgot' | 'reset' };

// ------------------------------------------------------------------ icons --
function EyeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

// -------------------------------------------------------------- validation -
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_CHECKS: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const passwordError = (v: string): string | null => PASSWORD_CHECKS.find((c) => !c.test(v))?.label ?? null;

function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {PASSWORD_CHECKS.map((c) => {
        const ok = c.test(value);
        return (
          <li key={c.id} className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon name={ok ? 'check' : 'x'} className="h-3.5 w-3.5" />
            {c.label}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------- layout --
function FeatureBullet({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
        <Icon name="check" className="h-4 w-4" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-slate-400">{body}</span>
      </span>
    </li>
  );
}

function LeftPanel() {
  return (
    <div className="hidden bg-slate-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div>
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Consistency Guard logo" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          <span className="text-xl font-semibold tracking-tight">Consistency Guard</span>
        </div>
        <h2 className="type-display mt-16 text-4xl">Evaluate. Compare. Trust AI.</h2>
        <p className="mt-4 max-w-md text-slate-400">
          Consistency Guard measures AI reliability with consistency testing across models and evidence-backed fact
          verification, so you can ship AI features you actually trust.
        </p>
        <ul className="mt-10 space-y-6">
          <FeatureBullet title="Cross-model consistency scoring" body="Ask the same question across providers and quantify agreement." />
          <FeatureBullet title="Evidence-backed fact verification" body="Every answer is checked against sources before you trust it." />
          <FeatureBullet title="Prompt quality intelligence" body="Learn which prompts produce reliable, repeatable answers." />
        </ul>
      </div>
      <p className="text-sm text-slate-500">© 2026 Consistency Guard</p>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </div>
  );
}

// Auth card: a single translucent material surface (skill §12 —
// backdrop-filter blur(20px) saturate(180%) + semi-transparent bg) floating
// over the page background. It springs in on mount with the shared
// critically-damped springDefault (interruptible, from live values);
// reduced-motion users get the short opacity cross-fade instead.
function AuthCard({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, filter: 'blur(8px)' }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={reducedMotion ? fadeOnly : springDefault}
      className="material-chrome relative w-full min-w-0 max-w-md rounded-2xl border border-slate-900/10 p-6 shadow-xl dark:border-white/10 dark:shadow-black/50 sm:p-8"
    >
      {children}
    </motion.div>
  );
}

function OAuthButton({ name, onClick }: { name: string; onClick: () => void }) {
  // Never truncate the provider label: single-line row below 640px (full
  // width, ample room), stacked label-over-badge at >=640px where each of the
  // three columns is narrow. The label is whitespace-nowrap with no truncation,
  // and flex-wrap lets the badge drop below instead of clipping in any case.
  return (
    <button
      type="button"
      onClick={onClick}
      className="cg-press flex w-full flex-row flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-col sm:gap-1 sm:py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <span className="whitespace-nowrap">{name}</span>
      <Badge>Soon</Badge>
    </button>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((v) => !v)}
          className="hit-pad absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------- login -
function LoginFormView() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, remember);
      const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
      setFormError(
        apiError.status === 429
          ? 'Too many attempts — account temporarily locked. Try again shortly.'
          : apiError.message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const oauthSoon = () => toast('OAuth is not configured in this build', { tone: 'info' });

  return (
    <>
      <h1 className="type-display text-2xl text-slate-900 dark:text-white">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to run AI reliability evaluations.</p>

      <div className="mt-4">
        <FormError message={formError} />
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Field label="Email" error={errors.email} htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
        </Field>

        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <label htmlFor="login-password" className="block min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
              Password
            </label>
            <Link to="/forgot-password" className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            label=""
            value={password}
            onChange={setPassword}
            error={errors.password}
            autoComplete="current-password"
          />
        </div>

        <Checkbox label="Remember me" checked={remember} onChange={(e) => setRemember(e.target.checked)} />

        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or continue with
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <OAuthButton name="Google" onClick={oauthSoon} />
        <OAuthButton name="GitHub" onClick={oauthSoon} />
        <OAuthButton name="Microsoft" onClick={oauthSoon} />
      </div>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          Create account
        </Link>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- register -
function RegisterFormView() {
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email';
    const pwErr = passwordError(password);
    if (pwErr) next.password = `Password must have ${pwErr.toLowerCase()}`;
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await signup(name.trim(), email.trim(), password, confirm);
      toast('Account created', { tone: 'success' });
      navigate('/setup/providers', { replace: true });
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const oauthSoon = () => toast('OAuth is not configured in this build', { tone: 'info' });

  return (
    <>
      <h1 className="type-display text-2xl text-slate-900 dark:text-white">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start evaluating AI reliability in minutes.</p>

      <div className="mt-4">
        <FormError message={formError} />
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Field label="Name" error={errors.name} htmlFor="register-name">
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field label="Email" error={errors.email} htmlFor="register-email">
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
        </Field>

        <div>
          <PasswordInput
            id="register-password"
            label="Password"
            value={password}
            onChange={setPassword}
            error={errors.password}
            autoComplete="new-password"
            describedBy="password-requirements"
          />
          <div id="password-requirements">
            <PasswordChecklist value={password} />
          </div>
        </div>

        <Field label="Confirm password" error={errors.confirm} htmlFor="register-confirm">
          <Input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or continue with
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <OAuthButton name="Google" onClick={oauthSoon} />
        <OAuthButton name="GitHub" onClick={oauthSoon} />
        <OAuthButton name="Microsoft" onClick={oauthSoon} />
      </div>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          Sign in
        </Link>
      </p>
    </>
  );
}

// ----------------------------------------------------------------- forgot -
function ForgotFormView() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 type-display text-2xl text-slate-900 dark:text-white">Check your inbox</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          If an account exists for that email, we&apos;ve sent a password reset link. It expires in 60 minutes.
        </p>
        <Link to="/login" className="mt-6 inline-block font-medium text-brand-700 hover:underline dark:text-brand-400">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="type-display text-2xl text-slate-900 dark:text-white">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Enter your account email and we&apos;ll send you a reset link.
      </p>

      <div className="mt-4">
        <FormError message={formError} />
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Field label="Email" error={emailError} htmlFor="forgot-email">
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
          />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          Back to login
        </Link>
      </p>
    </>
  );
}

// ------------------------------------------------------------------ reset -
function ResetFormView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="text-center">
        <ErrorState message="This password reset link is missing or invalid. Request a new one." />
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-brand-700 hover:underline dark:text-brand-400">
          Request a new reset link
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const pwErr = passwordError(password);
    if (pwErr) next.password = `Password must have ${pwErr.toLowerCase()}`;
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 type-display text-2xl text-slate-900 dark:text-white">Password updated</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your password has been reset. You can now sign in.</p>
        <Button className="mt-6" onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="type-display text-2xl text-slate-900 dark:text-white">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick a strong password for your account.</p>

      <div className="mt-4">
        <FormError message={formError} />
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <div>
          <PasswordInput
            id="reset-password"
            label="New password"
            value={password}
            onChange={setPassword}
            error={errors.password}
            autoComplete="new-password"
            describedBy="reset-password-requirements"
          />
          <div id="reset-password-requirements">
            <PasswordChecklist value={password} />
          </div>
        </div>

        <Field label="Confirm new password" error={errors.confirm} htmlFor="reset-confirm">
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={!!errors.confirm}
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full">
          Reset password
        </Button>
      </form>
    </>
  );
}

// --------------------------------------------------------------------- page -
export default function Auth({ mode }: AuthProps) {
  const { user, loading } = useAuth();

  if (!loading && user && (mode === 'login' || mode === 'register')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="grid min-h-screen min-w-0 lg:grid-cols-2">
      <LeftPanel />
      <div className="relative flex min-w-0 items-center justify-center bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
        {/* Brand-tinted wash behind the card so the frosted material reads as
            glass. Decorative only; clipped to the panel so it can never cause
            horizontal overflow, and the panel itself still scrolls. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-brand-200/50 blur-3xl dark:bg-brand-900/25" />
          <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-300/30 blur-3xl dark:bg-brand-800/20" />
          <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl dark:bg-teal-950/60" />
        </div>
        <div className="flex w-full min-w-0 flex-col items-center justify-center gap-5">
          <AuthCard>
            <div className="relative min-w-0">
              <PageTransition routeKey={mode}>
                {mode === 'login' && <LoginFormView />}
                {mode === 'register' && <RegisterFormView />}
                {mode === 'forgot' && <ForgotFormView />}
                {mode === 'reset' && <ResetFormView />}
              </PageTransition>
            </div>
          </AuthCard>
        </div>
      </div>
    </div>
  );
}
