import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck, AlertCircle } from 'lucide-react';
import { StoreLayout } from '../../components/StoreLayout';
import { SEOHead } from '../../components/SEOHead';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

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
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      setErrorMsg(err?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailAuthDisabled(false);
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
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method).'
        );
      } else {
        setErrorMsg(err?.message || 'Invalid email or password.');
      }
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
              in your inbox, then refresh below to continue.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={async () => {
                  const ok = await refreshAuthUser();
                  if (ok) {
                    showToast('Email verified! Welcome.');
                    navigate(redirect);
                  } else {
                    showToast('Email is not verified yet. Check your inbox/spam.', 'info');
                  }
                }}
                className="w-full py-3 rounded-xl bg-[#065F46] text-white text-sm font-semibold cursor-pointer"
              >
                I Have Verified — Continue
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resendVerificationEmail();
                  showToast('Verification email resent.');
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
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-zinc-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-[#065F46] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
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
                      href="https://console.firebase.google.com/project/gen-lang-client-0329974020/authentication/providers"
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
      setErrorMsg(err?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailAuthDisabled(false);
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
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
        setErrorMsg(
          'Email/Password registration is not enabled in Firebase Console yet. Continue with Google Sign-In below or enable Email/Password in Firebase Authentication.'
        );
      } else {
        setErrorMsg(err?.message || 'Registration failed.');
      }
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
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Phone Number</label>
              <input
                type="tel"
                required
                placeholder="+234 800 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                <p>{errorMsg}</p>
                {emailAuthDisabled && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGoogleRegister}
                      className="px-3 py-1.5 rounded-lg bg-[#065F46] text-white font-semibold cursor-pointer"
                    >
                      Continue with Google
                    </button>
                    <a
                      href="https://console.firebase.google.com/project/gen-lang-client-0329974020/authentication/providers"
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
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not send reset email.');
    }
  };

  return (
    <StoreLayout>
      <SEOHead
        title={`Reset Password – ${publicSettings.storeName}`}
        description="Reset your customer account password."
      />
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-8 space-y-5">
          <h1 className="font-display text-2xl font-bold text-zinc-900">Reset Password</h1>
          {sent ? (
            <div className="space-y-4 text-sm text-zinc-600">
              <p>
                If an account exists for <strong>{email}</strong>, a password reset link has been
                sent to that inbox.
              </p>
              <Link
                to="/login"
                className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white font-medium"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-zinc-600">
                Enter your registered email address and we will send you a password reset link.
              </p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg"
              />
              {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-[#065F46] cursor-pointer"
              >
                Send Password Reset Email
              </button>
            </form>
          )}
        </div>
      </div>
    </StoreLayout>
  );
}
