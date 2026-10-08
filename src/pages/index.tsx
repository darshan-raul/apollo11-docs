import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ToolMap from '@site/src/components/ToolMap';

import {markTransform, wheelPath} from './_kubernetesMark';
import styles from './index.module.css';

const stages = [
  {number: 'PREP', title: 'Launchpad', description: 'Meet Apollo Airlines. Learn what it takes to get its containers talking on one machine.', href: '/docs/learn/containers/process-image-container'},
  {number: 'GO', title: 'Ignition', description: 'Bring Kubernetes into the story. Who turns your declaration into a running application?', href: '/docs/learn/cluster/why-orchestration'},
  {number: '01', title: 'Liftoff', description: 'A booking Pod disappears. Discover who replaces it and how the application finds its feet again.', href: '/docs/learn/workloads/ownership-and-replicas'},
  {number: '02', title: 'Guidance', description: 'Follow a passenger’s request through names, addresses, and routes to the right service.', href: '/docs/learn/networking/pod-network-and-cni'},
  {number: '03', title: 'Mission Data', description: 'The database Pod is gone. Find out what must survive for the passenger’s reservation to remain.', href: '/docs/learn/storage/volume-lifetimes'},
  {number: '04', title: 'Flight Control', description: 'Decide when a service is ready, when it needs help, and how it should leave gracefully.', href: '/docs/learn/reliability/probes'},
  {number: '05', title: 'Payload Integration', description: 'Ship the next version of Apollo Airlines and understand what a rollback can recover.', href: '/docs/learn/delivery/rendering-and-helm'},
  {number: '06', title: 'Mission Operations', description: 'A booking is slow. Follow the metrics, logs, and traces to discover where the time went.', href: '/docs/learn/observability/signals-and-metrics'},
  {number: '07', title: 'Orbital Maneuvering', description: 'More passengers arrive. Explore which work to cache, when to scale, and what to measure.', href: '/docs/learn/scaling/measurement-baseline'},
  {number: 'NEXT', title: 'Beyond the Local Mission', description: 'Explore Command Module security, Lunar Orbit cloud operations, and the missions still ahead.', href: '/docs/status'}
];

const features = [
  {
    title: 'One airline, every stage',
    description: 'Stay with Apollo Airlines as its needs grow. A passenger’s booking gives every new Kubernetes concept a reason to exist.'
  },
  {
    title: 'Hands-on labs',
    description: 'Predict what will happen, try it on a local cluster, then investigate the result. You can also follow the whole story without running a lab.'
  },
  {
    title: 'Learn through recovery',
    description: 'A missing Pod, a stalled rollout, a slow booking: learn to follow the clues and explain why the system behaves the way it does.'
  },
  {
    title: 'A mission you can explain',
    description: 'Finish by following one booking across the system, connecting what you learned, and naming the questions still ahead.'
  }
];

// Tools in orbit around the moon. `start` is the angle each one begins at.
const satellites = [
  {logo: 'argo.svg', radius: 150, duration: 26, start: 200, trail: 9, reverse: false},
  {logo: 'helm.svg', radius: 215, duration: 44, start: 325, trail: 6, reverse: true},
  {logo: 'opentelemetry.svg', radius: 280, duration: 70, start: 35, trail: 8, reverse: false},
  {logo: 'linkerd.svg', radius: 280, duration: 70, start: 215, trail: 8, reverse: false}
];

// Seeded so the server render and the client hydration agree on every star.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars(count: number, seed: number) {
  const random = seededRandom(seed);
  return Array.from({length: count}, (_, i) => ({
    cx: Math.round(random() * 1600),
    cy: Math.round(random() * 900),
    r: Math.round((0.4 + random() * 1.1) * 10) / 10,
    opacity: Math.round((0.25 + random() * 0.65) * 100) / 100,
    twinkle: i % 5 === 0,
    delay: Math.round(random() * 60) / 10
  }));
}

const heroStars = buildStars(140, 11);
const ctaStars = buildStars(70, 1969);

function StarField({stars}: {stars: ReturnType<typeof buildStars>}) {
  return (
    <svg
      className={styles.starField}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true">
      {stars.map((star, i) => (
        <circle
          key={i}
          className={star.twinkle ? styles.twinkle : undefined}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          opacity={star.opacity}
          style={star.twinkle ? {animationDelay: `${star.delay}s`} : undefined}
        />
      ))}
    </svg>
  );
}

function Satellite({logo, radius, duration, start, trail, reverse}: (typeof satellites)[number]) {
  const logoUrl = useBaseUrl(`/img/stack/${logo}`);
  const x = 300 + radius;
  const timing = {
    animationDuration: `${duration}s`,
    animationDirection: reverse ? 'reverse' : 'normal'
  };
  return (
    <g transform={`rotate(${start} 300 300)`}>
      <g className={styles.orbiter} style={timing}>
        <circle
          className={styles.trail}
          cx="300"
          cy="300"
          r={radius}
          pathLength="100"
          strokeDasharray={`${trail} ${100 - trail}`}
          strokeDashoffset={reverse ? 0 : trail}
        />
        {/* Counter-rotate the chip so the logo stays upright all the way round. */}
        <g className={styles.upright} style={{...timing, transformOrigin: `${x}px 300px`}}>
          <g transform={`rotate(${-start} ${x} 300)`}>
            <circle className={styles.chip} cx={x} cy="300" r="15" />
            <image href={logoUrl} x={x - 9.5} y="290.5" width="19" height="19" />
          </g>
        </g>
      </g>
    </g>
  );
}

function OrbitDiagram() {
  // Scale the Kubernetes wheel to sit on the moon, centred on the diagram.
  const moonTransform = `translate(189.28 192.57) scale(0.285) ${markTransform}`;
  return (
    <svg className={styles.orbit} viewBox="0 0 600 600" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="moonSurface" cx="0.3" cy="0.26" r="0.9">
          <stop offset="0" stopColor="#f1ebf7" />
          <stop offset="0.45" stopColor="#b6a8ca" />
          <stop offset="0.85" stopColor="#5f4d79" />
          <stop offset="1" stopColor="#2a1c3b" />
        </radialGradient>
        <linearGradient id="moonShade" x1="0.2" y1="0.1" x2="0.88" y2="0.95">
          <stop offset="0.45" stopColor="#0d0716" stopOpacity="0" />
          <stop offset="1" stopColor="#0d0716" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="moonWheel" x1="0.2" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d8cce8" />
        </linearGradient>
        {/* Mottled regolith: coarse dark blotches plus a fine speckle. */}
        <filter id="moonTexture" x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="11" result="coarse" />
          <feColorMatrix in="coarse" type="matrix" values="0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 0 0.14  1.7 0 0 0 -0.7" result="blotches" />
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="4" result="fine" />
          <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.09  0 0 0 0 0.05  0 0 0 0 0.14  0 0.9 0 0 -0.38" result="speckle" />
          <feMerge>
            <feMergeNode in="blotches" />
            <feMergeNode in="speckle" />
          </feMerge>
        </filter>
        <radialGradient id="moonHalo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.45" stopColor="#c4a1e0" stopOpacity="0.28" />
          <stop offset="1" stopColor="#c4a1e0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="moonClip">
          <circle cx="300" cy="300" r="108" />
        </clipPath>
      </defs>

      <circle cx="300" cy="300" r="210" fill="url(#moonHalo)" />

      <g className={styles.rings}>
        <circle cx="300" cy="300" r="150" />
        <circle cx="300" cy="300" r="215" strokeDasharray="2 7" />
        <circle cx="300" cy="300" r="280" />
        <path d="M300 8v24M300 568v24M8 300h24M568 300h24" />
      </g>

      {/* A cratered moon with the Kubernetes wheel inlaid. */}
      <circle cx="300" cy="300" r="108" fill="url(#moonSurface)" />
      <g clipPath="url(#moonClip)">
        <rect x="180" y="185" width="240" height="230" filter="url(#moonTexture)" />
        <g className={styles.craters}>
          <circle cx="232" cy="262" r="9" />
          <circle cx="350" cy="232" r="6" />
          <circle cx="380" cy="300" r="11" />
          <circle cx="262" cy="372" r="13" />
          <circle cx="216" cy="318" r="5" />
          <circle cx="342" cy="384" r="7" />
          <circle cx="300" cy="216" r="4" />
        </g>
      </g>
      <path className={styles.wheelShadow} d={wheelPath} transform={`translate(2 3) ${moonTransform}`} />
      <path className={styles.wheel} d={wheelPath} transform={moonTransform} fill="url(#moonWheel)" />
      <circle cx="300" cy="300" r="108" fill="url(#moonShade)" />
      <circle className={styles.moonRim} cx="300" cy="300" r="108" />

      <g className={styles.orbitLabels}>
        <text x="300" y="142">LAUNCHPAD</text>
        <text x="300" y="77">LIFTOFF</text>
        <text x="300" y="46">ORBIT</text>
      </g>

      {satellites.map((satellite) => (
        <Satellite key={satellite.logo} {...satellite} />
      ))}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function HomepageHero() {
  return (
    <header className={styles.hero}>
      <StarField stars={heroStars} />
      <div className={styles.heroGlow} />
      <div className={styles.heroInner}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            One application. A mission through Kubernetes.
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleMain}>Apollo 11</span>
            <span className={styles.heroTitleSub}>Your Kubernetes learning mission</span>
          </h1>
          <p className={styles.heroDescription}>
            Take Apollo Airlines from its first container to a system you can
            explain, troubleshoot, and recover. Every stage begins with a problem
            worth solving. Read the story, then take the controls when you’re ready.
          </p>
          <div className={styles.heroCta}>
            <Link className={styles.primaryButton} to="/docs">
              <span>Start your journey</span>
              <span className={styles.buttonIcon}><ArrowIcon /></span>
            </Link>
            <Link className={styles.textLink} to="/docs/labs/setup">
              Prepare your launchpad
            </Link>
          </div>
          <dl className={styles.heroStats}>
            <div className={styles.stat}>
              <dt className={styles.statNumber}>01</dt>
              <dd className={styles.statLabel}>Airline to build</dd>
            </div>
            <div className={styles.stat}>
              <dt className={styles.statNumber}>Read</dt>
              <dd className={styles.statLabel}>Follow the story</dd>
            </div>
            <div className={styles.stat}>
              <dt className={styles.statNumber}>Fly</dt>
              <dd className={styles.statLabel}>Try the labs</dd>
            </div>
          </dl>
        </div>
        <div className={styles.heroVisual}>
          <OrbitDiagram />
        </div>
      </div>
    </header>
  );
}

function StagesSection() {
  return (
    <section className={styles.section}>
      <div className={styles.split}>
        <div className={styles.splitHeader}>
          <p className={styles.sectionLabel}>01 / Flight plan</p>
          <h2 className={styles.sectionTitle}>Your flight plan</h2>
          <p className={styles.sectionSubtitle}>Launchpad to orbit. Each mission starts where the last one leaves a question.</p>
        </div>
        <ol className={styles.stageList}>
          {stages.map((stage) => (
            <li key={stage.number} className={styles.reveal}>
              <Link to={stage.href} className={styles.stageRow}>
                <span className={styles.stageNumber}>{stage.number}</span>
                <h3 className={styles.stageTitle}>{stage.title}</h3>
                <p className={styles.stageDescription}>{stage.description}</p>
                <span className={styles.stageArrow}><ArrowIcon /></span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ToolsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>02 / Toolkit</p>
          <h2 className={styles.sectionTitle}>The mission toolkit</h2>
          <p className={styles.sectionSubtitle}>The cloud-native tools you meet along the way, from fundamentals to platform engineering.</p>
        </div>
        <div className={styles.toolsContainer}>
          <ToolMap />
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>03 / Approach</p>
          <h2 className={styles.sectionTitle}>Why Apollo 11</h2>
          <p className={styles.sectionSubtitle}>Designed for engineers who want real competence.</p>
        </div>
        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <article key={feature.title} className={`${styles.featureCard} ${styles.reveal}`}>
              <span className={styles.featureIndex}>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDescription}>{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className={styles.ctaSection}>
      <StarField stars={ctaStars} />
      <div className={styles.ctaHorizon} />
      <div className={styles.ctaContent}>
        <h2 className={styles.ctaTitle}>Ready for liftoff?</h2>
        <p className={styles.ctaDescription}>
          Your first stop is Launchpad. Bring your curiosity. We’ll meet the airline,
          unpack its first container, and build from there.
        </p>
        <Link className={styles.primaryButton} to="/docs">
          <span>Launch your mission</span>
          <span className={styles.buttonIcon}><ArrowIcon /></span>
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
      <div className={styles.page}>
        <HomepageHero />
        <main>
          <StagesSection />
          <ToolsSection />
          <FeaturesSection />
          <CtaSection />
        </main>
      </div>
    </Layout>
  );
}
