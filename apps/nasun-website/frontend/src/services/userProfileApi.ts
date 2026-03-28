const USER_PROFILE_API = import.meta.env.VITE_USER_PROFILE_API;

export async function updateDisplayName(token: string, displayName: string): Promise<void> {
  if (!USER_PROFILE_API) throw new Error('User Profile API is not configured');

  const res = await fetch(USER_PROFILE_API, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to update display name (${res.status})`);
  }
}
