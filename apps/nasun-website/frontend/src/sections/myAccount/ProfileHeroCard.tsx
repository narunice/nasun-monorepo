/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username with inline editing, and login identifier.
 *
 * Connected Accounts UI has been extracted to ConnectedAccountsCard.
 */

import { FC, useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox } from "@/components/ui";
import { GenesisPassBadge } from "./components/StatusBadges";
import { useProfileDisplay } from "./hooks/useProfileDisplay";
import { updateDisplayName } from "@/services/userProfileApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";

interface ProfileHeroCardProps {
  className?: string;
}

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Inline display name editing
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { displayName, avatarUrl, identiconUrl, fallbackLetter, loginIdentifier } =
    useProfileDisplay(user);

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  const startEditing = useCallback(() => {
    if (!user?.cognitoToken) return;
    setEditValue(user.customDisplayName || "");
    setEditError(null);
    setIsEditing(true);
  }, [user?.cognitoToken, user?.customDisplayName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditError(null);
  }, []);

  const saveDisplayName = useCallback(async () => {
    if (!user?.cognitoToken || !user.identityId) return;
    const trimmed = editValue.trim();

    // Empty = clear custom name (revert to provider name)
    if (!trimmed) {
      // For now, require a name. Clearing could be a future feature.
      setEditError("Display name is required");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
      setEditError("Must be 2-30 characters");
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await updateDisplayName(user.cognitoToken, trimmed);
      await refreshAndSaveUserProfile(user.identityId);
      setIsEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [user?.cognitoToken, user?.identityId, editValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveDisplayName();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }, [saveDisplayName, cancelEditing]);

  if (!user) {
    return (
      <OuterBox color="c1" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );
  }

  return (
    <OuterBox color="nw1" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <div className="flex items-center gap-4">
        <div className="relative">
          {(identiconUrl || (avatarUrl && !imageError)) ? (
            <img
              src={identiconUrl ?? avatarUrl!}
              alt={displayName}
              className={`w-16 h-16 rounded-2xl object-cover bg-gray-800 ${
                identiconUrl || imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onError={handleImageError}
              onLoad={handleImageLoad}
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nasun-c4 to-nasun-c5 flex items-center justify-center text-white text-2xl font-bold">
              {fallbackLetter}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => { setEditValue(e.target.value); setEditError(null); }}
                    onKeyDown={handleKeyDown}
                    maxLength={30}
                    disabled={isSaving}
                    className="bg-gray-800 border border-nasun-c5/40 rounded-sm px-2 py-1 text-sm font-semibold text-nasun-white outline-none focus:border-nasun-c4 w-48"
                    placeholder="Display name"
                  />
                  <button
                    onClick={saveDisplayName}
                    disabled={isSaving}
                    className="text-green-400 hover:text-green-300 disabled:opacity-40"
                    title="Save (Enter)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={isSaving}
                    className="text-nasun-white/40 hover:text-nasun-white/70 disabled:opacity-40"
                    title="Cancel (Esc)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {editError && <p className="text-xs text-red-400">{editError}</p>}
              </div>
            ) : (
              <div className="group flex items-center gap-1.5">
                <h6 className="font-semibold">{displayName}</h6>
                {user.cognitoToken && (
                  <button
                    onClick={startEditing}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-nasun-white/60"
                    title="Edit display name"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <GenesisPassBadge />
          </div>
          {loginIdentifier && (
            <p className="text-nasun-white/60">
              <span className="text-slate-400 font-medium text-sm lg:text-base">
                {loginIdentifier.value}
              </span>
            </p>
          )}
        </div>
      </div>
    </OuterBox>
  );
};

export default ProfileHeroCard;
