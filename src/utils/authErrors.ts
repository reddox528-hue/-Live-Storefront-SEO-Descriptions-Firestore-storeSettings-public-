export function validateEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function validateResetPasswordForm(
  newPassword: string,
  confirmPassword: string
): string | null {
  if (!newPassword) {
    return 'Please enter a new password.';
  }
  if (newPassword.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (newPassword !== confirmPassword) {
    return 'Passwords do not match. Please re-enter both fields.';
  }
  return null;
}

export function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/invalid-credential':
      return 'Incorrect email or password, or this account does not have an email/password login set up yet. Verify your details, use "Forgot password?", or sign in with Google.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again or use "Forgot password?" to reset it.';
    case 'auth/user-not-found':
      return 'No account was found with that email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in or reset your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact store support at reddox528@gmail.com for assistance.';
    case 'auth/too-many-requests':
      return 'Too many attempts were made. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication servers. Please check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method).';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing sign-in.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in request was cancelled. Please try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase Authentication yet. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    case 'auth/expired-action-code':
      return 'This password reset link has expired. Please request a new reset link.';
    case 'auth/invalid-action-code':
      return 'This password reset link is invalid or has already been used. Please request a new reset link.';
    case 'auth/requires-recent-login':
      return 'For security reasons, please sign out and sign back in before changing your password.';
    default: {
      if (err instanceof Error && err.message) {
        return err.message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/i, '').trim() ||
          'Authentication failed. Please try again.';
      }
      return 'Authentication failed. Please try again.';
    }
  }
}
