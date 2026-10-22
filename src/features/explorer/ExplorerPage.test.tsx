import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createQueryClient } from '../../api/useCatalog';
import { App } from '../../App';
import { computeResults } from '../../domain/results';
import { DEFAULT_FILTERS, parseFilters, type FilterState } from '../../domain/urlState';
import { setMockLatency, setMockMode } from '../../mocks/controller';
import { setDesktop } from '../../test/browser';
import { catalog } from '../../test/fixture';
import { summaryText } from './labels';

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  render(<App queryClient={createQueryClient({ retry: 0 })} />);
  return user;
}

const expectedSummary = (patch: Partial<FilterState>) => {
  const results = computeResults(catalog, { ...DEFAULT_FILTERS, ...patch });
  return summaryText(results.total, results.providerCount);
};

const summaryHeading = (text: string) => screen.findByRole('heading', { level: 2, name: text }, { timeout: 3000 });

describe('ExplorerPage', () => {
  it('shows skeletons while loading, then the view the URL describes (never an unfiltered list)', async () => {
    setMockLatency([150, 150]);
    renderAt('/?city=bangkok');
    expect(screen.getByRole('status')).toHaveTextContent('Loading services');
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    await summaryHeading(expectedSummary({ location: { kind: 'city', slug: 'bangkok' } }));
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card).toHaveTextContent('Bangkok, Thailand');
  });

  it('shows which part failed, and recovers on "Try again"', async () => {
    setMockMode('providers', 'error');
    const user = renderAt('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We couldn’t load services');
    expect(alert).toHaveTextContent('provider details');

    setMockMode('providers', 'ok');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await summaryHeading(expectedSummary({}));
  });

  it('writes filters to the URL and restores them with the back button', async () => {
    const user = renderAt('/');
    await summaryHeading(expectedSummary({}));

    await user.click(screen.getByRole('checkbox', { name: /^Lab test/ }));
    expect(parseFilters(window.location.search).types).toEqual(['lab_test']);
    await summaryHeading(expectedSummary({ types: ['lab_test'] }));

    window.history.back();
    await summaryHeading(expectedSummary({}));
    expect(window.location.search).toBe('');
    expect(screen.getByRole('checkbox', { name: /^Lab test/ })).not.toBeChecked();
  });

  it('shows live facet counts and disables options with no results', async () => {
    renderAt('/?country=NP');
    await summaryHeading(expectedSummary({ location: { kind: 'country', code: 'NP' } }));
    const { facets } = computeResults(catalog, { ...DEFAULT_FILTERS, location: { kind: 'country', code: 'NP' } });

    const labTest = screen.getByRole('checkbox', { name: /^Lab test/ });
    expect(labTest.closest('label')).toHaveTextContent(`${facets.type.get('lab_test')!.toLocaleString('en')} results`);
    expect(screen.getByRole('radio', { name: /^Only THB prices/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Only NPR prices/ })).toBeEnabled();
  });

  it('offers a way out of an empty result', async () => {
    const user = renderAt('/?q=zzzz&type=wellness');
    await summaryHeading('No services match your filters');
    await user.click(screen.getByRole('button', { name: /Remove the search “zzzz”/ }));
    await summaryHeading(expectedSummary({ types: ['wellness'] }));
  });

  it('limits each card to 3 services and "View all" narrows to that provider', async () => {
    const user = renderAt('/');
    await summaryHeading(expectedSummary({}));
    const firstCard = screen.getAllByRole('article')[0]!;
    expect(within(firstCard).getAllByRole('listitem')).toHaveLength(3);

    await user.click(within(firstCard).getByRole('button', { name: /View all \d+ matching services/ }));
    const { providers } = parseFilters(window.location.search);
    expect(providers).toHaveLength(1);
    await summaryHeading(expectedSummary({ providers }));
    const card = screen.getByRole('article');
    expect(within(card).getAllByRole('listitem').length).toBeGreaterThan(3);
  });

  it('filters by price inside the only currency on screen', async () => {
    const user = renderAt('/?city=bangkok&category=package:health-check-up');
    await summaryHeading(
      expectedSummary({ location: { kind: 'city', slug: 'bangkok' }, category: 'package:health-check-up' }),
    );
    await user.type(screen.getByLabelText('Max (THB)'), '5000{Enter}');
    expect(window.location.search).toContain('currency=THB');
    expect(window.location.search).toContain('max=5000');
    await summaryHeading('4 services from 1 provider');
  });

  it('announces result count changes to screen readers', async () => {
    const user = renderAt('/');
    await summaryHeading(expectedSummary({}));
    await user.click(screen.getByRole('checkbox', { name: /^Insurance/ }));
    const live = document.querySelector('[aria-live="polite"]')!;
    await waitFor(() => expect(live).toHaveTextContent(expectedSummary({ types: ['insurance'] })), { timeout: 2000 });
  });
});

describe('mobile filter drawer', () => {
  it('counts the pending selection before it is applied, then applies it', async () => {
    setDesktop(false);
    const user = renderAt('/');
    await summaryHeading(expectedSummary({}));

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const drawer = screen.getByRole('dialog', { name: 'Filters' });
    await user.click(within(drawer).getByRole('checkbox', { name: /^Wellness/ }));

    const expected = computeResults(catalog, { ...DEFAULT_FILTERS, types: ['wellness'] }).total;
    expect(within(drawer).getByRole('button', { name: `Show ${expected.toLocaleString('en')} results` })).toBeVisible();
    expect(window.location.search).toBe(''); // nothing applied yet

    await user.click(within(drawer).getByRole('button', { name: /^Show/ }));
    expect(parseFilters(window.location.search).types).toEqual(['wellness']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toHaveFocus();
  });

  it('discards the draft when closed without applying', async () => {
    setDesktop(false);
    const user = renderAt('/');
    await summaryHeading(expectedSummary({}));
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const drawer = screen.getByRole('dialog');
    await user.click(within(drawer).getByRole('checkbox', { name: /^Wellness/ }));
    await user.click(within(drawer).getByRole('button', { name: /Close/ }));
    expect(window.location.search).toBe('');
  });
});
