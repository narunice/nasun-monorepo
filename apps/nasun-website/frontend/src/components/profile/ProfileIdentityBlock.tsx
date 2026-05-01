/**
 * ProfileIdentityBlock — shared identity rendering surface.
 *
 * Used by both my-account ProfileHeroCard and uju Profile tab. Reads the
 * authenticated profile via `useMyProfile`, resolves display name and avatar
 * via `@nasun/profile-core`, and exposes inline editing of customDisplayName.
 *
 * Avatar upload UI is added in stage C (frontend); for stage B this component
 * shows the avatar (read-only) plus the display-name editor.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from 'boring-avatars';
import {
  resolveAvatarUrl,
  resolveDisplayName,
  type EcosystemProfile,
} from '@nasun/profile-react';
import { useUserStore } from '@/store/userStore';
import { useMyProfile } from '@/features/profile/useMyProfile';
import {
  UserProfileApiError,
  uploadAvatarFile,
} from '@/services/userProfileApi';

const PUBLIC_AVATARS_BASE_URL =
  (import.meta.env.VITE_PUBLIC_AVATARS_BASE_URL as string | undefined) ?? '';

const SHORT_HEAD = 6;
const SHORT_TAIL = 4;

function shortenWallet(addr: string): string {
  if (addr.length <= SHORT_HEAD + SHORT_TAIL + 2) return addr;
  return `${addr.slice(0, SHORT_HEAD)}...${addr.slice(-SHORT_TAIL)}`;
}

function ecosystemProfileFromUserStore(user: ReturnType<typeof useUserStore.getState>['user']): EcosystemProfile | null {
  if (!user) return null;
  // Map zustand UserData → EcosystemProfile shape so the resolver works
  // identically across surfaces (server-built unified profile vs. legacy
  // store-derived shape during initial render before useMyProfile fetches).
  return {
    identityId: user.identityId,
    walletAddress: user.walletAddress,
    customDisplayName: user.customDisplayName,
    customAvatarKey: user.customAvatarKey,
    customAvatarBanned: user.customAvatarBanned,
    provider: user.provider,
    username: user.username,
    email: user.email,
    twitterHandle: user.twitterHandle,
    originalTwitterHandle: user.originalTwitterHandle,
    linkedAccounts: user.linkedAccounts as EcosystemProfile['linkedAccounts'],
  };
}

function validateDisplayName(name: string): string | null {
  if (name.length === 0) return 'Display name cannot be empty';
  if (name.length < 2) return 'At least 2 characters';
  if (name.length > 30) return 'Max 30 characters';
  if (name.startsWith('@')) return 'Cannot start with @';
  if (name.startsWith('0x')) return 'Cannot start with 0x';
  return null;
}

export interface ProfileIdentityBlockProps {
  /**
   * Visual variant. 'uju' uses the uju color palette, 'myAccount' the legacy
   * nasun-website palette. Edit affordance is identical between variants.
   */
  variant: 'uju' | 'myAccount';
  /**
   * Optional className applied to the outer container.
   */
  className?: string;
}

export function ProfileIdentityBlock({
  variant,
  className = '',
}: ProfileIdentityBlockProps) {
  const user = useUserStore((s) => s.user);
  const { data: serverProfile, isFetched, updateName, updateAvatarKey } = useMyProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isAvatarBanned = !!serverProfile?.customAvatarBanned;
  const avatarUploadEnabled =
    !!PUBLIC_AVATARS_BASE_URL && !!user?.cognitoToken && !isAvatarBanned;

  const onAvatarPick = useCallback(() => {
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  const onAvatarFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const token = user?.cognitoToken;
    if (!token) { setUploadError('Session expired'); return; }
    setIsUploading(true);
    setUploadError(null);
    try {
      const key = await uploadAvatarFile(token, file);
      await updateAvatarKey.mutateAsync(key);
    } catch (err) {
      const apiErr = err as UserProfileApiError;
      if (apiErr?.code === 'AVATAR_BANNED') {
        setUploadError('Avatar uploads disabled. Contact support.');
      } else {
        setUploadError(apiErr?.message || 'Upload failed');
      }
    } finally {
      setIsUploading(false);
    }
  }, [user?.cognitoToken, updateAvatarKey]);

  const onAvatarRemove = useCallback(async () => {
    setUploadError(null);
    try {
      await updateAvatarKey.mutateAsync(null);
    } catch (err) {
      setUploadError((err as Error)?.message || 'Remove failed');
    }
  }, [updateAvatarKey]);

  // Source: prefer server-fetched profile; fall back to zustand store while
  // useMyProfile is still loading on first render.
  const profile: EcosystemProfile | null = useMemo(() => {
    if (serverProfile) return serverProfile;
    return ecosystemProfileFromUserStore(user);
  }, [serverProfile, user]);

  const { name: displayName } = useMemo(
    () => resolveDisplayName(profile),
    [profile],
  );
  const avatarUrl = useMemo(
    () => resolveAvatarUrl(profile, { baseUrl: PUBLIC_AVATARS_BASE_URL }),
    [profile],
  );
  const walletAddress = profile?.walletAddress;

  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(profile?.customDisplayName ?? '');
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [profile?.customDisplayName]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    const trimmed = draft.trim().replace(/\s+/g, ' ');
    const validationError = validateDisplayName(trimmed);
    if (validationError) { setError(validationError); return; }
    try {
      await updateName.mutateAsync(trimmed);
      setEditing(false);
      setError(null);
    } catch (err) {
      const apiErr = err as UserProfileApiError;
      if (apiErr?.statusCode === 429) {
        setError('Too many display-name changes. Try again later.');
      } else {
        setError(apiErr?.message || 'Save failed');
      }
    }
  }, [draft, updateName]);

  const palette = variant === 'uju'
    ? {
        nameClass: 'text-uju-primary',
        secondaryClass: 'text-uju-secondary',
        editIconClass: 'text-uju-secondary hover:text-uju-primary',
        inputClass: 'bg-uju-bg border border-uju-border text-uju-primary',
        saveBtnClass: 'bg-pado-2 hover:opacity-90 text-uju-bg',
        cancelBtnClass: 'text-uju-secondary hover:text-uju-primary',
        errorClass: 'text-red-400',
      }
    : {
        nameClass: 'text-nasun-white',
        secondaryClass: 'text-nasun-white/80',
        editIconClass: 'text-nasun-white/70 hover:text-nasun-white',
        inputClass: 'bg-nasun-c6 border border-nasun-white/20 text-nasun-white',
        saveBtnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
        cancelBtnClass: 'text-nasun-white/80 hover:text-nasun-white',
        errorClass: 'text-red-400',
      };

  const isLoading = !isFetched && !user;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="relative shrink-0 group">
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-16 h-16 rounded-2xl object-cover bg-black/20"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
          />
        ) : walletAddress ? (
          <div className="w-16 h-16 rounded-2xl overflow-hidden">
            <Avatar name={walletAddress} variant="pixel" size={64} square />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nasun-c4 to-nasun-c5" />
        )}
        {avatarUploadEnabled && (
          <>
            <button
              type="button"
              onClick={onAvatarPick}
              disabled={isUploading || updateAvatarKey.isPending}
              className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/0 hover:bg-black/40 focus:bg-black/40 transition-colors text-white opacity-0 hover:opacity-100 focus:opacity-100 disabled:cursor-wait disabled:opacity-100 disabled:bg-black/40"
              aria-label="Change avatar"
              title="Change avatar"
            >
              {isUploading || updateAvatarKey.isPending ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onAvatarFile}
              className="hidden"
            />
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') cancel();
                }}
                disabled={updateName.isPending}
                maxLength={30}
                placeholder="Display name"
                className={`rounded-lg px-2.5 py-1 text-sm w-full max-w-[200px] focus:outline-none focus:border-cyan-500 disabled:opacity-50 ${palette.inputClass}`}
              />
              <button
                onClick={save}
                disabled={updateName.isPending || draft.trim().length === 0}
                className={`text-sm font-medium px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors ${palette.saveBtnClass}`}
              >
                {updateName.isPending ? '...' : 'Save'}
              </button>
              <button
                onClick={cancel}
                disabled={updateName.isPending}
                className={`text-sm font-medium px-2 py-1 transition-colors ${palette.cancelBtnClass}`}
              >
                Cancel
              </button>
            </div>
            <div className={`text-sm tabular-nums ${palette.secondaryClass}`}>
              {draft.length}/30
            </div>
            {error && <p className={`text-sm ${palette.errorClass}`}>{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h6 className={`font-semibold truncate text-base ${palette.nameClass}`}>
                {isLoading ? '...' : displayName}
              </h6>
              {!isLoading && (
                <button
                  onClick={startEdit}
                  className={`shrink-0 transition-colors ${palette.editIconClass}`}
                  title="Edit display name"
                  aria-label="Edit display name"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
            {walletAddress && (
              <p className={`text-sm font-mono ${palette.secondaryClass}`}>
                {shortenWallet(walletAddress)}
              </p>
            )}
            {(uploadError || (!!profile?.customAvatarKey && avatarUploadEnabled)) && (
              <div className="flex items-center gap-3 mt-1">
                {uploadError && (
                  <span className={`text-sm ${palette.errorClass}`}>{uploadError}</span>
                )}
                {!!profile?.customAvatarKey && avatarUploadEnabled && !uploadError && (
                  <button
                    type="button"
                    onClick={onAvatarRemove}
                    disabled={updateAvatarKey.isPending}
                    className={`text-sm ${palette.cancelBtnClass} disabled:opacity-50`}
                  >
                    Remove avatar
                  </button>
                )}
              </div>
            )}
            {isAvatarBanned && (
              <p className={`text-sm mt-1 ${palette.errorClass}`}>
                Avatar uploads disabled. Contact support.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
