export function formatMarkdownCodeSpan(value: string): string {
  const backtickRuns = value.match(/`+/g);
  if (!backtickRuns) return `\`${value}\``;

  const longestRun = Math.max(...backtickRuns.map(run => run.length));
  const fence = '`'.repeat(longestRun + 1);
  return `${fence} ${value} ${fence}`;
}

export function escapeMarkdownTableCell(value: string): string {
  let escaped = '';

  for (const character of value) {
    if (character === '|') {
      escaped += '\\|';
    } else {
      escaped += character;
    }
  }

  return escaped;
}
