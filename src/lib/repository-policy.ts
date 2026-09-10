/** Optional exact repository boundary; absent, blank, or standalone '*' is unrestricted. */
export function isRepositoryAllowed(
  configuredRepositories: string | undefined,
  repo: string
): boolean {
  const configured = configuredRepositories?.trim();
  if (!configured || configured === '*') return true;

  return configured
    .split(/[,\n]/)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(repo.trim().toLowerCase());
}
