import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  emailToStaffKey,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { clampStr, StaffMember, StaffRole } from '../types/tpms';

export type AuthAccessStatus =
  | 'loading'
  | 'unauthenticated'
  | 'unverified_email'
  | 'unauthorized_staff'
  | 'inactive_staff'
  | 'authorized';

interface AuthContextValue {
  user: User | null;
  staffProfile: StaffMember | null;
  role: StaffRole | null;
  accessStatus: AuthAccessStatus;
  authError: string | null;
  isAdmin: boolean;
  isManagerOrAdmin: boolean;
  isWorkingStaff: boolean;
  isReadOnly: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffMember | null>(null);
  const [accessStatus, setAccessStatus] = useState<AuthAccessStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);

  const resolveStaffAccess = useCallback(async (firebaseUser: User | null) => {
    setAuthError(null);

    if (!firebaseUser || !firebaseUser.email) {
      setStaffProfile(null);
      setAccessStatus('unauthenticated');
      return;
    }

    if (!firebaseUser.emailVerified) {
      setStaffProfile(null);
      setAccessStatus('unverified_email');
      return;
    }

    const normalizedEmail = firebaseUser.email.trim().toLowerCase();
    const staffKey = emailToStaffKey(normalizedEmail);
    const staffRef = doc(db, 'staff', staffKey);

    try {
      const snap = await getDoc(staffRef);

      if (snap.exists()) {
        const data = snap.data() as Omit<StaffMember, 'id'>;
        const member: StaffMember = { id: snap.id, ...data };

        if (!member.active) {
          setStaffProfile(member);
          setAccessStatus('inactive_staff');
          return;
        }

        // Bind UID once if missing
        if (!member.uid) {
          try {
            await updateDoc(staffRef, {
              uid: clampStr(firebaseUser.uid, 128),
              updatedAt: serverTimestamp(),
            });
            member.uid = firebaseUser.uid;
          } catch {
            // Non-fatal if update fails for Report Viewer or concurrent write
          }
        }

        setStaffProfile(member);
        setAccessStatus('authorized');
        return;
      }

      // Bootstrap primary firm Admin on first sign-in
      if (normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
        const bootstrapPayload = {
          staffId: 'STF-001',
          staffName: clampStr(firebaseUser.displayName || 'Practice Administrator', 120),
          email: clampStr(normalizedEmail, 160),
          role: 'Admin' as StaffRole,
          active: true,
          department: 'Tax Practice Management',
          designation: 'Managing Partner / Admin',
          phone: '',
          uid: clampStr(firebaseUser.uid, 128),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(staffRef, bootstrapPayload);
        setStaffProfile({
          id: staffKey,
          staffId: bootstrapPayload.staffId,
          staffName: bootstrapPayload.staffName,
          email: bootstrapPayload.email,
          role: 'Admin',
          active: true,
          department: bootstrapPayload.department,
          designation: bootstrapPayload.designation,
          phone: '',
          uid: firebaseUser.uid,
        });
        setAccessStatus('authorized');
        return;
      }

      setStaffProfile(null);
      setAccessStatus('unauthorized_staff');
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `staff/${staffKey}`);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAccessStatus('loading');
      void resolveStaffAccess(firebaseUser).catch((err) => {
        setAuthError(err instanceof Error ? err.message : 'Unable to verify staff account.');
        setAccessStatus('unauthenticated');
      });
    });
    return () => unsubscribe();
  }, [resolveStaffAccess]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
      throw err;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Email/Password sign-in is not yet enabled in this Firebase project. Enable Email/Password under Firebase Console → Authentication → Sign-in method, or use Google Sign-In.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setAuthError('Invalid email or password. Please verify your credentials and try again.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
      throw err;
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setStaffProfile(null);
    setAccessStatus('unauthenticated');
  }, []);

  const reloadProfile = useCallback(async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await resolveStaffAccess(auth.currentUser);
    }
  }, [resolveStaffAccess]);

  const role: StaffRole | null = staffProfile?.active ? staffProfile.role : null;
  const isAdmin = role === 'Admin';
  const isManagerOrAdmin = role === 'Admin' || role === 'Manager-HOD';
  const isWorkingStaff = role === 'Admin' || role === 'Manager-HOD' || role === 'Staff';
  const isReadOnly = role === 'Report Viewer';

  return (
    <AuthContext.Provider
      value={{
        user,
        staffProfile,
        role,
        accessStatus,
        authError,
        isAdmin,
        isManagerOrAdmin,
        isWorkingStaff,
        isReadOnly,
        signInWithGoogle,
        signInWithEmail,
        resendVerificationEmail,
        logout,
        reloadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
