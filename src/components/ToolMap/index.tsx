import type {ReactNode} from 'react';
import clsx from 'clsx';
import useBaseUrl from '@docusaurus/useBaseUrl';

import {zones, type Tool} from './data';
import styles from './styles.module.css';

function ToolTile({tool}: {tool: Tool}): ReactNode {
  const logoUrl = useBaseUrl(tool.logo ? `/img/stack/${tool.logo}` : '/');
  return (
    <a
      className={styles.tool}
      href={tool.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${tool.name}: ${tool.role}`}>
      <span className={clsx(styles.logo, tool.wide && styles.logoWide)}>
        {tool.logo ? (
          <img src={logoUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.badge} aria-hidden="true">{tool.badge}</span>
        )}
      </span>
      <span className={styles.toolName}>{tool.name}</span>
      <span className={styles.toolRole}>{tool.role}</span>
    </a>
  );
}

/**
 * The course's tool landscape: Fundamentals and Advanced zones, each a grid of
 * categories. Pure HTML/CSS; reflows from two columns to one on narrow screens.
 */
export default function ToolMap({compact = false}: {compact?: boolean}): ReactNode {
  return (
    <figure
      className={clsx(styles.map, compact && styles.compact)}
      aria-label="Apollo11 tool landscape">
      {zones.map((zone) => (
        <section key={zone.title} className={styles.zone}>
          <header className={styles.zoneHeader}>
            <h3 className={styles.zoneTitle}>{zone.title}</h3>
            <p className={styles.zoneBlurb}>{zone.blurb}</p>
          </header>
          <div className={styles.categories}>
            {zone.categories.map((category) => (
              <div key={category.title} className={styles.category}>
                <h4 className={styles.categoryTitle}>{category.title}</h4>
                <div className={styles.tools}>
                  {category.tools.map((tool) => (
                    <ToolTile key={tool.name + tool.role} tool={tool} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </figure>
  );
}
