import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const stages = [
  {
    number: '00',
    title: 'Launchpad',
    emoji: '🧱',
    description: 'Docker fundamentals, containers, Dockerfiles, and Docker Compose',
    color: '#9b59b6'
  },
  {
    number: '01',
    title: 'Ignition',
    emoji: '🔥',
    description: 'First Kubernetes cluster, kubectl basics, and your first Pod',
    color: '#e74c3c'
  },
  {
    number: '02',
    title: 'Liftoff',
    emoji: '🚀',
    description: 'Deployments, Namespaces, ConfigMaps, Secrets, Jobs',
    color: '#3498db'
  },
  {
    number: '03',
    title: 'Guidance',
    emoji: '🧭',
    description: 'Networking, Services, Ingress, DNS, NetworkPolicies',
    color: '#2ecc71'
  },
  {
    number: '04',
    title: 'Data Systems',
    emoji: '💾',
    description: 'Persistent Storage, PV, PVC, StorageClasses, StatefulSets',
    color: '#f39c12'
  },
  {
    number: '05',
    title: 'Flight Control',
    emoji: '🎛️',
    description: 'Probes, Resources, QoS, Priority, Resource Quotas',
    color: '#1abc9c'
  },
  {
    number: '06',
    title: 'Payload Integration',
    emoji: '📦',
    description: 'Helm, Kustomize, CI/CD, GitHub Actions, ArgoCD',
    color: '#9b59b6'
  },
  {
    number: '07',
    title: 'Operations',
    emoji: '📡',
    description: 'Monitoring, Prometheus, Grafana, Loki, OpenTelemetry',
    color: '#e67e22'
  },
  {
    number: '08',
    title: 'Scaling',
    emoji: '🛰️',
    description: 'HPA, Taints, Tolerations, Node Affinity, Pod Affinity',
    color: '#8e44ad'
  },
  {
    number: '09',
    title: 'Hardening',
    emoji: '🔐',
    description: 'RBAC, Security Contexts, Vault, Sealed Secrets, OPA',
    color: '#c0392b'
  },
  {
    number: '10',
    title: 'Cloud Deploy',
    emoji: '🌕',
    description: 'EKS, GKE, AKS, Terraform, Cluster Autoscaler',
    color: '#2980b9'
  },
  {
    number: '11',
    title: 'Extensions',
    emoji: '🧪',
    description: 'Service Mesh, Argo Rollouts, DevSecOps, Velero, Chaos Mesh',
    color: '#16a085'
  }
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

function GlowOrb({color, size, position}: {color: string; size: string; position: string}) {
  return (
    <div
      className={styles.glowOrb}
      style={{
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        width: size,
        height: size,
        ...position
      }}
    />
  );
}

function HomepageHero() {
  return (
    <header className={styles.hero}>
      <StarField />
      <GlowOrb color="rgba(155, 89, 182, 0.4)" size="600px" position={{top: '-200px', left: '-100px'}} />
      <GlowOrb color="rgba(187, 143, 206, 0.3)" size="400px" position={{bottom: '-100px', right: '-50px'}} />
      <div className={styles.heroContent}>
        <div className={styles.badge}>11-Stage Journey</div>
        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleMain}>Apollo 11</span>
          <span className={styles.heroTitleSub}>Kubernetes Learning Bootstrap</span>
        </h1>
        <p className={styles.heroDescription}>
          A comprehensive, hands-on journey from container fundamentals to advanced cluster operations.
          Build real-world Kubernetes expertise through 13 progressive stages.
        </p>
        <div className={styles.heroCta}>
          <Link className={styles.primaryButton} to="/docs">
            <span>Start Your Journey</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
          <Link className={styles.secondaryButton} to="/docs/liftoff">
            Explore Curriculum
          </Link>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>11</span>
            <span className={styles.statLabel}>Stages</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>25+</span>
            <span className={styles.statLabel}>Technologies</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNumber}>100%</span>
            <span className={styles.statLabel}>Hands-on</span>
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
        <h2 className={styles.sectionTitle}>Your Mission Architecture</h2>
        <p className={styles.sectionSubtitle}>Progress through 13 carefully designed stages</p>
      </div>
      <div className={styles.stagesGrid}>
        {stages.map((stage, index) => {
          let linkPath = '/docs/liftoff';
          if (index === 0) linkPath = '/docs/liftoff';
          else if (index === 1) linkPath = '/docs/ignition';
          else linkPath = `/docs/stage-${index}`;
          return (
            <Link key={index} to={linkPath} className={styles.stageCard}>
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
      title: 'Structured Learning Path',
      description: 'Follow a carefully sequenced curriculum that builds foundational knowledge before advancing to complex topics.'
    },
    {
      icon: '⚡',
      title: 'Hands-On Labs',
      description: 'Every concept is reinforced with practical exercises using industry-standard tools like kind, kubectl, and Helm.'
    },
    {
      icon: '🔄',
      title: 'Real-World Patterns',
      description: 'Learn patterns used in production environments: GitOps, monitoring, security hardening, and cloud deployments.'
    },
    {
      icon: '🚀',
      title: 'Career Focused',
      description: 'Skills directly applicable to Kubernetes certification and production cluster administration roles.'
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
        Begin your journey to Kubernetes mastery. No prior experience required—just curiosity and determination.
      </p>
      <div className={styles.ctaButtons}>
        <Link className={styles.primaryButton} to="/docs">
          <span>Launch Mission</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </Link>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Kubernetes Learning Journey"
      description="13-stage Kubernetes learning bootstrap - From containers to advanced cluster operations">
      <HomepageHero />
      <main>
        <StagesSection />
        <FeaturesSection />
        <CtaSection />
      </main>
    </Layout>
  );
}