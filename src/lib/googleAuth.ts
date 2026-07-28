export type GoogleTokenPayload = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

export function getGoogleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;
}

/** Verify Google ID token (from Sign In With Google button). */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload | null> {
  const clientId = getGoogleClientId();
  if (!clientId || !idToken) return null;

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string>;

    if (data.aud !== clientId) return null;
    if (data.email_verified !== 'true') return null;
    if (!data.sub || !data.email) return null;

    return {
      sub: data.sub,
      email: String(data.email).toLowerCase(),
      name: data.name || data.given_name || 'Customer',
      picture: data.picture,
    };
  } catch {
    return null;
  }
}
