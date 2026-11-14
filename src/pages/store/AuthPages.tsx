import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
} from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  formatAuthError,
  validateEmailFormat,
  validateResetPasswordForm,
} from '../../utils/authErrors';

export function LoginPage() {
  const {
    firebaseUser,
    signInWithGoogle,
    loginWithEmail,
    resendVerificationEmail,
    refreshAuthUser,
  } = useAuth();
  const { publicSettings, showToast } = useStore();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/account';
  const resetSuccess = searchParams.get('reset') === 'success';
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [emailAuthDisabled, setEmailAuthDisabled] = useState(false);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setEmailAuthDisabled(false);
    setLoading(true);
    try {
      await signInWithGoogle();
      showToast('Signed in successfully.');
      navigate(redirect);
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailAuthDisabled(false);
    if (!validateEmailFormat(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      const verified = await refreshAuthUser();
      if (verified) {
        showToast('Signed in successfully.');
        navigate(redirect);
      }
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed') {
        setEmailAuthDisabled(true);
      }
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <StoreLayout>
        <SEOHead
          title={`Verify Email – ${publicSettings.storeName}`}
          description="Verify your email address to access your account."
        />
        <div className="max-w-md mx-auto px-4 py-16">
          <div className="bg-white border border-zinc-200 rounded-2xl p-8 space-y-5 text-center">
            <MailCheck className="w-10 h-10 text-[#065F46] mx-auto" />
            <h1 className="font-display text-2xl font-bold text-zinc-900">Verify Your Email</h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              We sent a verification link to <strong>{firebaseUser.email}</strong>. Click the link
              in your inbox (or spam folder), then refresh below to continue.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const ok = await refreshAuthUser();
                    if (ok) {
                      showToast('Email verified! Welcome.');
                      navigate(redirect);
                    } else {
                      showToast('Email is not verified yet. Check your inbox or spam folder.', 'info');
                    }
                  } catch (err: any) {
                    showToast(formatAuthError(err), 'error');
                  }
                }}
                className="w-full py-3 rounded-xl bg-[#065F46] text-white text-sm font-semibold cursor-pointer"
              >
                I Have Verified — Continue
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await resendVerificationEmail();
                    showToast('Verification email resent.');
                  } catch (err: any) {
                    showToast(formatAuthError(err), 'error');
                  }
                }}
                className="w-full py-2.5 rounded-xl border border-zinc-300 text-sm font-medium text-zinc-700 cursor-pointer"
              >
                Resend Verification Email
              </button>
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <SEOHead
        title={`Sign In – ${publicSettings.storeName}`}
        description="Sign in to track your Nigerian Naira orders, manage saved addresses, and submit bank transfer receipts."
      />
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-900">Sign In</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Access your orders, delivery addresses, and account settings.
            </p>
          </div>

          {resetSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>Your password has been updated. Sign in below with your new password.</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold text-zinc-900 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
          >
            <span>Continue with Google</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-200" />
            <span className="shrink mx-3 text-xs text-zinc-400">or with email</span>
            <div className="flex-grow border-t border-zinc-200" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="login-password" className="text-xs font-medium text-zinc-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-[#065F46] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-zinc-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                {emailAuthDisabled && (
                  <div className="pl-6 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="px-3 py-1.5 rounded-lg bg-[#065F46] text-white font-semibold cursor-pointer"
                    >
                      Continue with Google
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-medium text-red-800"
                    >
                      Enable in Firebase Console
                    </a>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-xs text-center text-zinc-600">
            New customer?{' '}
            <Link
              to={`/register?redirect=${encodeURIComponent(redirect)}`}
              className="font-semibold text-[#065F46] hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </StoreLayout>
  );
}

export function RegisterPage() {
  const { signInWithGoogle, registerWithEmail } = useAuth();
  const { publicSettings, showToast } = useStore();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/account';
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [emailAuthDisabled, setEmailAuthDisabled] = useState(false);

  const handleGoogleRegister = async () => {
    setErrorMsg('');
    setEmailAuthDisabled(false);
    setLoading(true);
    try {
      await signInWithGoogle();
      showToast('Signed in successfully.');
      navigate(redirect);
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailAuthDisabled(false);
    if (!validateEmailFormat(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    setLoading(true);
    try {
      await registerWithEmail(fullName, phone, email, password);
      showToast('Account created! Please check your email to verify.');
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed') {
        setEmailAuthDisabled(true);
      }
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`Create Account – ${publicSettings.storeName}`}
        description="Register a customer account to track orders and manage delivery addresses."
      />
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-900">Create Account</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Save delivery addresses and track bank-transfer orders.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleRegister}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold text-zinc-900 cursor-pointer disabled:opacity-60"
          >
            Continue with Google
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-200" />
            <span className="shrink mx-3 text-xs text-zinc-400">or register with email</span>
            <div className="flex-grow border-t border-zinc-200" />
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Phone Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                required
                placeholder="+234 800 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-zinc-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Minimum 6 characters.</p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                {emailAuthDisabled && (
                  <div className="pl-6 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGoogleRegister}
                      className="px-3 py-1.5 rounded-lg bg-[#065F46] text-white font-semibold cursor-pointer"
                    >
                      Continue with Google
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-medium text-red-800"
                    >
                      Enable in Firebase Console
                    </a>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create Customer Account'}
            </button>
          </form>

          <p className="text-xs text-center text-zinc-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#065F46] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </StoreLayout>
  );
}

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const { publicSettings } = useStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validateEmailFormat(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`Forgot Your Password? – ${publicSettings.storeName}`}
        description="Request a secure Firebase password reset link for your account."
      />
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#065F46]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-900">
                Forgot Your Password?
              </h1>
            </div>
          </div>

          {sent ? (
            <div className="space-y-4 text-sm text-zinc-600">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="font-semibold">Check your email for a reset link</p>
                    <p className="text-xs leading-relaxed text-emerald-800">
                      If an account exists for <strong>{email.trim()}</strong>, we have sent
                      password reset instructions to that address.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Please check both your <strong>inbox</strong> and your <strong>spam or junk folder</strong>.
                Reset links expire automatically for your security.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/login"
                  className="flex-1 text-center px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
                >
                  Back to Login
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setErrorMsg('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-300 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                >
                  Try Another Email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-zinc-600 leading-relaxed">
                Enter the email address registered to your account and we will send you a link to
                reset your password.
              </p>
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
              </button>

              <div className="text-center pt-1">
                <Link to="/login" className="text-xs font-semibold text-[#065F46] hover:underline">
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </StoreLayout>
  );
}

export function ResetPasswordPage() {
  const { verifyResetCode, completePasswordReset, verifyEmailActionCode } = useAuth();
  const { publicSettings } = useStore();
  const [searchParams] = useSearchParams();

  const mode = (searchParams.get('mode') || 'resetPassword').trim();
  const actionCode = (searchParams.get('oobCode') || '').trim();

  const [checkingCode, setCheckingCode] = useState(true);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [emailVerifiedDone, setEmailVerifiedDone] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    async function inspectActionLink() {
      if (!actionCode) {
        if (active) {
          setCodeError(
            'This password reset link is missing a valid security code. Please request a new reset link.'
          );
          setCheckingCode(false);
        }
        return;
      }

      if (mode === 'verifyEmail') {
        try {
          await verifyEmailActionCode(actionCode);
          if (active) {
            setEmailVerifiedDone(true);
          }
        } catch (err: any) {
          if (active) {
            setCodeError(formatAuthError(err));
          }
        } finally {
          if (active) setCheckingCode(false);
        }
        return;
      }

      try {
        const accountEmail = await verifyResetCode(actionCode);
        if (active) {
          setVerifiedEmail(accountEmail);
        }
      } catch (err: any) {
        if (active) {
          setCodeError(formatAuthError(err));
        }
      } finally {
        if (active) {
          setCheckingCode(false);
        }
      }
    }

    inspectActionLink();
    return () => {
      active = false;
    };
  }, [actionCode, mode, verifyEmailActionCode, verifyResetCode]);

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validationError = validateResetPasswordForm(newPassword, confirmPassword);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordReset(actionCode, newPassword);
      setCompleted(true);
    } catch (err: any) {
      setFormError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`Reset Password – ${publicSettings.storeName}`}
        description="Set a new password for your customer account."
      />
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-5">
          {checkingCode ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#065F46] mx-auto" />
              <h1 className="font-display text-xl font-bold text-zinc-900">
                Verifying Security Link
              </h1>
              <p className="text-xs text-zinc-500">
                Validating your request with Firebase Authentication...
              </p>
            </div>
          ) : emailVerifiedDone ? (
            <div className="space-y-4 text-center">
              <MailCheck className="w-10 h-10 text-[#065F46] mx-auto" />
              <h1 className="font-display text-2xl font-bold text-zinc-900">Email Verified</h1>
              <p className="text-sm text-zinc-600">
                Your email address has been verified. You can now sign in and place orders.
              </p>
              <Link
                to="/login"
                className="inline-block w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
              >
                Return to Login
              </Link>
            </div>
          ) : codeError ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
                  <div className="space-y-1">
                    <h1 className="font-semibold text-sm">Reset Link Invalid or Expired</h1>
                    <p className="text-xs leading-relaxed">{codeError}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  to="/forgot-password"
                  className="w-full text-center py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
                >
                  Request a New Reset Link
                </Link>
                <Link
                  to="/login"
                  className="w-full text-center py-2.5 rounded-xl border border-zinc-300 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : completed ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-[#065F46] mx-auto" />
              <h1 className="font-display text-2xl font-bold text-zinc-900">Password Updated</h1>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Your password has been successfully updated. You can now sign in with your new
                password.
              </p>
              <Link
                to="/login?reset=success"
                className="inline-block w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46]"
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-zinc-900">
                  Reset Your Password
                </h1>
                {verifiedEmail && (
                  <p className="text-xs text-zinc-600 mt-1">
                    Setting a new password for <strong>{verifiedEmail}</strong>
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-zinc-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Must be at least 6 characters.</p>
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="block text-xs font-medium text-zinc-700 mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-new-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-zinc-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Updating Password...' : 'Update Password'}
              </button>

              <div className="text-center pt-1">
                <Link to="/login" className="text-xs font-semibold text-[#065F46] hover:underline">
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </StoreLayout>
  );
}
