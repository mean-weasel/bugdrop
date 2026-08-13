import type { MessageScreen } from './public-types';

export function createMessageScreen(screen: Readonly<MessageScreen>): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bdv-surface bdf-message';
  const header = document.createElement('div');
  header.className = 'bdv-header';
  const title = document.createElement('h2');
  title.className = 'bdv-title';
  title.textContent = screen.title;
  header.appendChild(title);
  if (screen.description) {
    const description = document.createElement('p');
    description.className = 'bdv-description';
    description.textContent = screen.description;
    header.appendChild(description);
  }
  section.appendChild(header);
  return section;
}
