import { useId } from 'react';
import { formatMoney } from '../../domain/pricing';
import type { ProviderGroup } from '../../domain/results';
import { SERVICE_TYPE_LABELS, type Catalog, type Provider, type Service } from '../../domain/types';
import { formatNumber, plural } from './labels';
import { PriceTag } from './PriceTag';

function Rating({ provider }: { provider: Provider }) {
  if (provider.rating === null) {
    return <span className="rating rating-new">New · no reviews yet</span>;
  }
  return (
    <span className="rating">
      <span aria-hidden="true">★ </span>
      <span className="visually-hidden">Rated </span>
      {provider.rating.toFixed(1)}
      <span className="visually-hidden"> out of 5</span>
      <span className="rating-count"> ({plural(provider.reviewCount, 'review')})</span>
    </span>
  );
}

function categoryPath(catalog: Catalog, service: Service): string | null {
  if (!service.categoryKey) return null;
  const category = catalog.categoryByKey.get(service.categoryKey);
  if (!category) return null;
  const subSlug = service.subcategoryKey?.split('/')[1];
  const sub = subSlug ? category.children.find((c) => c.slug === subSlug) : undefined;
  return sub ? `${category.title} › ${sub.title}` : category.title;
}

function ServiceRow({ catalog, service }: { catalog: Catalog; service: Service }) {
  const path = categoryPath(catalog, service);
  return (
    <li className="service">
      <div className="service-body">
        <p className="service-title">{service.title}</p>
        <p className="service-meta">
          {SERVICE_TYPE_LABELS[service.type]}
          {path && ` · ${path}`}
        </p>
        {service.testAtHome && (
          <p className="service-home">
            Home test available
            {service.homeTestCharge && service.homeTestCharge.gt(0)
              ? ` · ${formatMoney(service.homeTestCharge, service.currency)} home visit fee`
              : ''}
          </p>
        )}
      </div>
      <PriceTag pricing={service.pricing} currency={service.currency} />
    </li>
  );
}

interface ProviderCardProps {
  catalog: Catalog;
  group: ProviderGroup;
  /** How many services to show before "View all". */
  limit: number;
  headingLevel: 3 | 4;
  onViewAll: (providerId: number) => void;
}

export function ProviderCard({ catalog, group, limit, headingLevel, onViewAll }: ProviderCardProps) {
  const headingId = useId();
  const { provider, services } = group;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const shown = services.slice(0, limit);
  return (
    <article className="card" aria-labelledby={headingId}>
      <header className="card-header">
        <div>
          <Heading id={headingId} className="card-title">
            {provider.name}
          </Heading>
          <p className="card-meta">
            {provider.city.name}, {provider.country.name} · Prices in {provider.currency}
          </p>
        </div>
        <Rating provider={provider} />
      </header>
      <ul className="service-list">
        {shown.map((service) => (
          <ServiceRow key={service.id} catalog={catalog} service={service} />
        ))}
      </ul>
      {services.length > shown.length && (
        <button type="button" className="button button-link" onClick={() => onViewAll(provider.id)}>
          View all {formatNumber(services.length)} matching services
          <span className="visually-hidden"> from {provider.name}</span>
        </button>
      )}
    </article>
  );
}

export function ProviderCardSkeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="card-header">
        <div>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-text" />
        </div>
        <div className="skeleton skeleton-rating" />
      </div>
      <ul className="service-list">
        {[0, 1, 2].map((row) => (
          <li key={row} className="service">
            <div className="service-body">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-text" />
            </div>
            <div className="skeleton skeleton-price" />
          </li>
        ))}
      </ul>
    </div>
  );
}
