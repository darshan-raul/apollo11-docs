import type {CSSProperties, ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

import styles from './index.module.css';

const stages = [
  {number: 'PREP', title: 'Launchpad', emoji: '🧱', description: 'Meet Apollo Airlines. Learn what it takes to get its containers talking on one machine.', href: '/docs/learn/containers/process-image-container', color: '#9b59b6'},
  {number: 'GO', title: 'Ignition', emoji: '🔥', description: 'Bring Kubernetes into the story. Who turns your declaration into a running application?', href: '/docs/learn/cluster/why-orchestration', color: '#e74c3c'},
  {number: '01', title: 'Liftoff', emoji: '🚀', description: 'A booking Pod disappears. Discover who replaces it and how the application finds its feet again.', href: '/docs/learn/workloads/ownership-and-replicas', color: '#3498db'},
  {number: '02', title: 'Guidance', emoji: '🧭', description: 'Follow a passenger’s request through names, addresses, and routes to the right service.', href: '/docs/learn/networking/pod-network-and-cni', color: '#2ecc71'},
  {number: '03', title: 'Mission Data', emoji: '💾', description: 'The database Pod is gone. Find out what must survive for the passenger’s reservation to remain.', href: '/docs/learn/storage/volume-lifetimes', color: '#f39c12'},
  {number: '04', title: 'Flight Control', emoji: '🎛️', description: 'Decide when a service is ready, when it needs help, and how it should leave gracefully.', href: '/docs/learn/reliability/probes', color: '#1abc9c'},
  {number: '05', title: 'Payload Integration', emoji: '📦', description: 'Ship the next version of Apollo Airlines and understand what a rollback can recover.', href: '/docs/learn/delivery/rendering-and-helm', color: '#9b59b6'},
  {number: '06', title: 'Mission Operations', emoji: '📡', description: 'A booking is slow. Follow the metrics, logs, and traces to discover where the time went.', href: '/docs/learn/observability/signals-and-metrics', color: '#e67e22'},
  {number: '07', title: 'Orbital Maneuvering', emoji: '🛰️', description: 'More passengers arrive. Explore which work to cache, when to scale, and what to measure.', href: '/docs/learn/scaling/measurement-baseline', color: '#8e44ad'},
  {number: 'NEXT', title: 'Beyond the Local Mission', emoji: '🌕', description: 'Explore Command Module security, Lunar Orbit cloud operations, and the missions still ahead.', href: '/docs/status', color: '#c0392b'}
];

function StarField() {
  return (
    <div className={styles.starField}>
      {Array.from({length: 80}).map((_, i) => (
        <div
          key={i}
          className={styles.star}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${2 + Math.random() * 3}s`,
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`
          }}
        />
      ))}
    </div>
  );
}

function GlowOrb({color, size, position}: {color: string; size: string; position: CSSProperties}) {
  return (
    <div
      className={styles.glowOrb}
      style={{
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        width: size,
        height: size,
        ...position,
      }}
    />
  );
}

function Rocket() {
  return (
    <div className={styles.rocket}>
      {/* CSS rocket using transforms — no external assets needed */}
      <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none">
        {/* Rocket body — upright for left-to-right flight */}
        <path d="M24 4 C24 4 38 16 38 28 C38 34 32 42 24 46 C16 42 10 34 10 28 C10 16 24 4 24 4Z"
              fill="#bb8fce" opacity="0.9"/>
        {/* Nose cone highlight */}
        <path d="M24 4 C24 4 30 12 30 20 C30 20 24 18 24 4Z" fill="#e8d5f2" opacity="0.5"/>
        {/* Left fin */}
        <path d="M10 28 L4 38 L10 35Z" fill="#9b59b6"/>
        {/* Right fin */}
        <path d="M38 28 L44 38 L38 35Z" fill="#9b59b6"/>
        {/* Center fin */}
        <path d="M20 32 L18 44 L24 40 L30 44 L28 32Z" fill="#8e44c9"/>
        {/* Window */}
        <circle cx="24" cy="22" r="5" fill="#1a0a2e" stroke="#e8d5f2" strokeWidth="1.5" opacity="0.9"/>
        <circle cx="22" cy="20" r="1.5" fill="#fff" opacity="0.6"/>
        {/* Engine nozzle */}
        <rect x="21" y="40" width="6" height="4" rx="1" fill="#7d3c98"/>
        {/* Exhaust flame */}
        <ellipse cx="24" cy="47" rx="4" ry="3" fill="#f39c12" opacity="0.8"/>
        <ellipse cx="24" cy="47" rx="2" ry="5" fill="#e74c3c" opacity="0.6"/>
      </svg>
    </div>
  );
}

function HomepageHero() {
  return (
    <header className={styles.hero}>
      <StarField />
      <GlowOrb color="rgba(155, 89, 182, 0.4)" size="600px" position={{top: '-200px', left: '-100px'}} />
      <GlowOrb color="rgba(187, 143, 206, 0.3)" size="400px" position={{bottom: '-100px', right: '-50px'}} />
      <Rocket />
      <div className={styles.heroContent}>
        <div className={styles.badge}>One application. A mission through Kubernetes.</div>
        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleMain}>Apollo 11</span>
          <span className={styles.heroTitleSub}>Your Kubernetes Learning Mission</span>
        </h1>
        <p className={styles.heroDescription}>
          Take Apollo Airlines from its first container to a system you can
          explain, troubleshoot, and recover. Every stage begins with a problem
          worth solving. Read the story, then take the controls when you’re ready.
        </p>
        <div className={styles.heroCta}>
          <Link className={styles.primaryButton} to="/docs">
            <span>Start Your Journey</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
          <Link className={styles.secondaryButton} to="/docs/labs/setup">
            Prepare Your Launchpad
          </Link>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>01</span>
            <span className={styles.statLabel}>Airline to build</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>Read</span>
            <span className={styles.statLabel}>Follow the story</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>Fly</span>
            <span className={styles.statLabel}>Try the labs</span>
          </div>
        </div>
      </div>
      <div className={styles.scrollIndicator}>
        <span>Scroll to explore</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M19 12l-7 7-7-7"/>
        </svg>
      </div>
    </header>
  );
}

function StagesSection() {
  return (
    <section className={styles.stagesSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Your Flight Plan</h2>
        <p className={styles.sectionSubtitle}>Launchpad to orbit. Each mission starts where the last one leaves a question.</p>
      </div>
      <div className={styles.stagesGrid}>
        {stages.map((stage) => {
          return (
            <Link key={stage.number} to={stage.href} className={styles.stageCard}>
              <div className={styles.stageCardGlow} style={{background: stage.color}} />
              <div className={styles.stageNumber} style={{color: stage.color}}>{stage.number}</div>
              <div className={styles.stageEmoji}>{stage.emoji}</div>
              <h3 className={styles.stageTitle}>{stage.title}</h3>
              <p className={styles.stageDescription}>{stage.description}</p>
              <div className={styles.stageArrow}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: '🎯',
      title: 'One Airline, Every Stage',
      description: 'Stay with Apollo Airlines as its needs grow. A passenger’s booking gives every new Kubernetes concept a reason to exist.'
    },
    {
      icon: '⚡',
      title: 'Hands-On Labs',
      description: 'Predict what will happen, try it on a local cluster, then investigate the result. You can also follow the whole story without running a lab.'
    },
    {
      icon: '🔄',
      title: 'Learn Through Recovery',
      description: 'A missing Pod, a stalled rollout, a slow booking: learn to follow the clues and explain why the system behaves the way it does.'
    },
    {
      icon: '🚀',
      title: 'A Mission You Can Explain',
      description: 'Finish by following one booking across the system, connecting what you learned, and naming the questions still ahead.'
    }
  ];

  return (
    <section className={styles.featuresSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Why Apollo 11</h2>
        <p className={styles.sectionSubtitle}>Designed for engineers who want real competence</p>
      </div>
      <div className={styles.featuresGrid}>
        {features.map((feature, index) => (
          <div key={index} className={styles.featureCard}>
            <div className={styles.featureIcon}>{feature.icon}</div>
            <h3 className={styles.featureTitle}>{feature.title}</h3>
            <p className={styles.featureDescription}>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className={styles.ctaSection}>
      <div className={styles.ctaGlow} />
      <h2 className={styles.ctaTitle}>Ready for Liftoff?</h2>
      <p className={styles.ctaDescription}>
        Your first stop is Launchpad. Bring your curiosity—we’ll meet the airline,
        unpack its first container, and build from there.
      </p>
      <div className={styles.ctaButtons}>
        <Link className={styles.primaryButton} to="/docs">
          <span>Launch Your Mission</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </Link>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Your Kubernetes Learning Mission"
      description="Follow Apollo Airlines from Launchpad to orbit: learn Kubernetes through one application's story, with hands-on labs when you're ready.">
      <HomepageHero />
      <main>
        <StagesSection />
        <FeaturesSection />
        <CtaSection />
      </main>
    </Layout>
  );
}
