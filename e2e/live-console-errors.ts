const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

function referencesGoogleFontsHost(message: string): boolean {
  return (message.match(URL_PATTERN) ?? []).some(
    candidate => URL.canParse(candidate) && new URL(candidate).hostname === 'fonts.gstatic.com'
  );
}

export function isExpectedLiveConsoleError(message: string): boolean {
  return (
    message.includes('Missing data-repo') ||
    referencesGoogleFontsHost(message) ||
    message.includes('CORS') ||
    message.includes('net::ERR_FAILED')
  );
}
