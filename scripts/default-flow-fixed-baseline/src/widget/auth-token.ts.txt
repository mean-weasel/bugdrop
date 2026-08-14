export type BugDropAuthTokenProvider = () => string | Promise<string> | null | undefined;

type GlobalWithTokenProviders = Window & Record<string, unknown>;

export function resolveAuthTokenProvider(
  providerName: string | undefined,
  globalObject: GlobalWithTokenProviders = window as unknown as GlobalWithTokenProviders
): BugDropAuthTokenProvider | undefined {
  if (!providerName) return undefined;

  const provider = globalObject[providerName];
  if (typeof provider !== 'function') {
    console.warn(`[BugDrop] data-auth-token-provider "${providerName}" must reference a function.`);
    return undefined;
  }

  return provider as BugDropAuthTokenProvider;
}

export async function getAuthHeaders(
  tokenProvider: BugDropAuthTokenProvider | undefined
): Promise<Record<string, string>> {
  if (!tokenProvider) return {};

  const token = await tokenProvider();
  if (!token) return {};

  return {
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };
}
