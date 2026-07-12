import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the simulator-first project overview', () => {
    const html = renderToString(<App pathname="/" />);

    expect(html).toContain('Roberts');
    expect(html).toContain('deterministic procedural simulator');
    expect(html).toContain('Private by default');
    expect(html).toContain('make verify');
    expect(html).toContain('not production-ready');
  });

  it('rejects an invalid meeting route', () => {
    expect(renderToString(<App pathname="/meetings/not-a-uuid" />)).toContain('Invalid meeting link');
  });
});
