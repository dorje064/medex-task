import { useId, useState } from 'react';
import type { FacetCounts } from '../../domain/results';
import { SERVICE_TYPE_LABELS, SERVICE_TYPES, type Catalog } from '../../domain/types';
import type { FilterState } from '../../domain/urlState';
import { FacetOption } from './FacetOption';
import { PriceFilter } from './PriceFilter';

export type FilterChange = (patch: Partial<FilterState>, options?: { replace?: boolean }) => void;

interface FilterPanelProps {
  catalog: Catalog;
  state: FilterState;
  facets: FacetCounts;
  onChange: FilterChange;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

export function FilterPanel({ catalog, state, facets, onChange }: FilterPanelProps) {
  const id = useId();
  const selectedCategory = state.category ? catalog.categoryByKey.get(state.category) : undefined;

  return (
    <div className="filter-panel">
      <fieldset className="filter-group">
        <legend>Service type</legend>
        {SERVICE_TYPES.map((type) => (
          <FacetOption
            key={type}
            type="checkbox"
            name={`${id}-type`}
            label={SERVICE_TYPE_LABELS[type]}
            count={facets.type.get(type) ?? 0}
            checked={state.types.includes(type)}
            onChange={() => onChange({ types: toggle(state.types, type) })}
          />
        ))}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Category</legend>
        <FacetOption
          type="radio"
          name={`${id}-category`}
          label="All categories"
          checked={!state.category}
          onChange={() => onChange({ category: null })}
        />
        {catalog.categories.map((category) => {
          const checked = state.category === category.key;
          return (
            <div key={category.key}>
              <FacetOption
                type="radio"
                name={`${id}-category`}
                label={category.label}
                count={facets.category.get(category.key) ?? 0}
                checked={checked}
                onChange={() => onChange({ category: category.key })}
              />
              {checked && category.children.length > 0 && (
                <fieldset className="filter-subgroup">
                  <legend className="visually-hidden">{category.label} subcategory</legend>
                  <FacetOption
                    type="radio"
                    name={`${id}-sub`}
                    label={`All ${category.title}`}
                    checked={!state.sub}
                    onChange={() => onChange({ sub: null })}
                  />
                  {category.children.map((sub) => (
                    <FacetOption
                      key={sub.slug}
                      type="radio"
                      name={`${id}-sub`}
                      label={sub.title}
                      count={facets.subcategory.get(`${category.key}/${sub.slug}`) ?? 0}
                      checked={state.sub === sub.slug}
                      onChange={() => onChange({ sub: sub.slug })}
                    />
                  ))}
                </fieldset>
              )}
            </div>
          );
        })}
        {state.category && !selectedCategory && (
          <p className="filter-note">The category in this link is no longer available.</p>
        )}
      </fieldset>

      <fieldset className="filter-group">
        <legend>Location</legend>
        <FacetOption
          type="radio"
          name={`${id}-location`}
          label="Anywhere"
          checked={!state.location}
          onChange={() => onChange({ location: null })}
        />
        {catalog.locations.map((country) => (
          <div key={country.code}>
            <FacetOption
              type="radio"
              name={`${id}-location`}
              label={country.name}
              count={facets.country.get(country.code) ?? 0}
              checked={state.location?.kind === 'country' && state.location.code === country.code}
              onChange={() => onChange({ location: { kind: 'country', code: country.code } })}
            />
            <div className="filter-subgroup">
              {country.cities.map((city) => (
                <FacetOption
                  key={city.slug}
                  type="radio"
                  name={`${id}-location`}
                  label={city.name}
                  count={facets.city.get(city.slug) ?? 0}
                  checked={state.location?.kind === 'city' && state.location.slug === city.slug}
                  onChange={() => onChange({ location: { kind: 'city', slug: city.slug } })}
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <PriceFilter state={state} facets={facets} onChange={onChange} />

      <fieldset className="filter-group">
        <legend>Home testing</legend>
        <FacetOption
          type="checkbox"
          name={`${id}-home`}
          label="Available as a home test"
          count={facets.home}
          checked={state.home}
          onChange={() => onChange({ home: !state.home })}
        />
      </fieldset>

      <ProviderFilter catalog={catalog} state={state} facets={facets} onChange={onChange} />
    </div>
  );
}

function ProviderFilter({ catalog, state, facets, onChange }: FilterPanelProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const count = (providerId: number) => facets.provider.get(providerId) ?? 0;

  // Selected first, then providers with results, then the unavailable ones.
  const providers = catalog.providers
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.city.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const rank = (p: typeof a) => (state.providers.includes(p.id) ? 0 : count(p.id) > 0 ? 1 : 2);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

  return (
    <fieldset className="filter-group">
      <legend>Provider</legend>
      <label className="visually-hidden" htmlFor={`${id}-search`}>
        Search providers by name or city
      </label>
      <input
        id={`${id}-search`}
        className="text-input"
        type="search"
        placeholder="Search providers"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-controls={`${id}-list`}
      />
      <div id={`${id}-list`} className="provider-list" role="group" aria-label="Providers">
        {providers.map((provider) => (
          <FacetOption
            key={provider.id}
            type="checkbox"
            name={`${id}-provider`}
            label={provider.name}
            hint={provider.city.name}
            count={count(provider.id)}
            checked={state.providers.includes(provider.id)}
            onChange={() => onChange({ providers: toggle(state.providers, provider.id) })}
          />
        ))}
        {providers.length === 0 && <p className="filter-note">No provider matches “{query.trim()}”.</p>}
      </div>
    </fieldset>
  );
}
