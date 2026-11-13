import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, BOOTSTRAP_ADMIN_EMAIL, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types/ecommerce';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  authReady: boolean;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (fullName: string, phone: string, email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  updateCustomerProfile: (fullName: string, phone: string) => Promise<void>;
  changeCustomerPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const syncUserAndRole = useCallback(async (user: FirebaseUser | null) => {
    if (!user) {
      setUserProfile(null);
      setIsAdmin(false);
      return;
    }

    // Check verified email status before reading/writing Firestore profile
    if (!user.emailVerified) {
      setUserProfile(null);
      setIsAdmin(false);
      return;
    }

    try {
      const tokenResult = await user.getIdTokenResult();
      const hasClaimAdmin = tokenResult.claims?.admin === true;
      const isBootstrapOwner = user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

      let hasAdminDoc = false;
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        hasAdminDoc = adminSnap.exists();
      } catch {
        hasAdminDoc = false;
      }

      const resolvedAdmin = hasClaimAdmin || isBootstrapOwner || hasAdminDoc;
      setIsAdmin(resolvedAdmin);

      // Ensure bootstrap owner has an /admins/{uid} record for full audit traceability
      if (isBootstrapOwner && !hasAdminDoc) {
        await setDoc(doc(db, 'admins', user.uid), {
          uid: user.uid,
          email: user.email || BOOTSTRAP_ADMIN_EMAIL,
          grantedBy: 'bootstrap',
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        setUserProfile(snap.data() as UserProfile);
      } else {
        const pendingPhone = sessionStorage.getItem('koramarket_pending_phone') || '';
        const newProfile: Record<string, any> = {
          uid: user.uid,
          fullName: user.displayName || user.email?.split('@')[0] || 'Customer',
          email: user.email || '',
          phone: pendingPhone,
          role: 'customer',
          accountStatus: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userRef, newProfile);
        sessionStorage.removeItem('koramarket_pending_phone');
        const createdSnap = await getDoc(userRef);
        setUserProfile(createdSnap.exists() ? (createdSnap.data() as UserProfile) : (newProfile as UserProfile));
      }
    } catch (err) {
      console.error('Error syncing user profile:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await syncUserAndRole(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, [syncUserAndRole]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    await syncUserAndRole(cred.user);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await syncUserAndRole(cred.user);
  };

  const registerWithEmail = async (
    fullName: string,
    phone: string,
    email: string,
    password: string
  ) => {
    sessionStorage.setItem('koramarket_pending_phone', phone.trim());
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: fullName.trim() });
    await sendEmailVerification(cred.user);
    setFirebaseUser(cred.user);
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('No signed-in user.');
    await sendEmailVerification(auth.currentUser);
  };

  const refreshAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setFirebaseUser(auth.currentUser);
    await syncUserAndRole(auth.currentUser);
    return auth.currentUser.emailVerified;
  };

  const updateCustomerProfile = async (fullName: string, phone: string) => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) {
      throw new Error('Verified account required to update profile.');
    }
    const uid = auth.currentUser.uid;
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        fullName: fullName.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      });
      await updateProfile(auth.currentUser, { displayName: fullName.trim() });
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) setUserProfile(snap.data() as UserProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const changeCustomerPassword = async (currentPassword: string, newPassword: string) => {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('Email/password account required to change password.');
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPassword);
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        isAdmin,
        authReady,
        signInWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshAuthUser,
        updateCustomerProfile,
        changeCustomerPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
