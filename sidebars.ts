import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  main: [
    {type: 'doc', id: 'index', label: 'Flight Plan & Overview'},
    {
      type: 'category', label: 'Mission Briefing', collapsed: false,
      items: [
        'start/prerequisites',
        'start/how-to-use-this-course',
        'start/terminal-git-and-yaml',
        'start/apollo-airlines',
      ],
    },
    {
      type: 'category', label: 'Launchpad · Containers', collapsed: false,
      items: [
        'missions/launchpad',
        'learn/containers/process-image-container',
        'learn/containers/images-and-configuration',
        'learn/containers/networks-and-clients',
        'learn/containers/state-and-dependencies',
        {type: 'doc', id: 'launchpad', label: 'Launchpad lab · Take the controls'},
      ],
    },
    {
      type: 'category', label: 'Ignition · First Cluster', collapsed: true,
      items: [
        'missions/ignition',
        'learn/cluster/why-orchestration',
        'learn/cluster/objects-and-api',
        'learn/cluster/reconciliation-and-components',
        'learn/cluster/pod-lifecycle',
        {type: 'doc', id: 'ignition', label: 'Ignition lab · Start the engines'},
      ],
    },
    {
      type: 'category', label: 'Stage 1 · Liftoff', collapsed: true,
      items: [
        'missions/liftoff',
        'learn/workloads/ownership-and-replicas',
        'learn/workloads/services-and-readiness',
        'learn/workloads/configuration-and-identity',
        'learn/workloads/jobs-and-initialization',
        'learn/workloads/rollouts-and-rollback',
        'learn/workloads/ephemeral-state',
        {type: 'doc', id: 'stage-1', label: 'Liftoff lab · Workloads'},
      ],
    },
    {
      type: 'category', label: 'Stage 2 · Guidance', collapsed: true,
      items: [
        'missions/guidance',
        'learn/networking/pod-network-and-cni',
        'learn/networking/service-control-and-data-paths',
        'learn/networking/dns-and-namespaces',
        'learn/networking/nodeport-and-loadbalancer',
        'learn/networking/ingress-and-tls',
        'learn/networking/gateway-api',
        {type: 'doc', id: 'stage-2', label: 'Guidance lab · Networking'},
      ],
    },
    {
      type: 'category', label: 'Stage 3 · Mission Data', collapsed: true,
      items: [
        'missions/mission-data',
        'learn/storage/volume-lifetimes',
        'learn/storage/claims-and-provisioning',
        'learn/storage/statefulsets-and-headless-dns',
        'learn/storage/statefulset-storage-and-operations',
        'learn/storage/initialization-and-seeding',
        'learn/storage/recovery-boundaries',
        {type: 'doc', id: 'stage-3', label: 'Mission Data lab · Storage'},
      ],
    },
    {
      type: 'category', label: 'Stage 4 · Flight Control', collapsed: true,
      items: [
        'missions/flight-control',
        'learn/reliability/probes',
        'learn/reliability/termination-and-draining',
        'learn/reliability/requests-limits-and-pressure',
        'learn/reliability/scheduling',
        'learn/reliability/disruption-budgets',
        {type: 'doc', id: 'stage-4', label: 'Flight Control lab · Reliability'},
      ],
    },
    {
      type: 'category', label: 'Stage 5 · Payload Integration', collapsed: true,
      items: [
        'missions/payload-integration',
        'learn/delivery/rendering-and-helm',
        'learn/delivery/kustomize-comparison',
        'learn/delivery/ci-and-image-delivery',
        'learn/delivery/gitops-and-ownership',
        'learn/delivery/promotion-and-rollback',
        {type: 'doc', id: 'stage-5', label: 'Payload Integration lab · Delivery'},
      ],
    },
    {
      type: 'category', label: 'Stage 6 · Mission Operations', collapsed: true,
      items: [
        'missions/mission-operations',
        'learn/observability/signals-and-metrics',
        'learn/observability/discovery-and-collection',
        'learn/observability/queries-alerts-and-objectives',
        'learn/observability/logs',
        'learn/observability/traces',
        'learn/observability/correlating-a-booking',
        {type: 'doc', id: 'stage-6', label: 'Mission Operations lab · Observability'},
      ],
    },
    {
      type: 'category', label: 'Stage 7 · Orbital Maneuvering', collapsed: true,
      items: [
        'missions/orbital-maneuvering',
        'learn/scaling/measurement-baseline',
        'learn/scaling/cache-aside',
        'learn/scaling/hpa',
        'learn/scaling/vpa-and-capacity',
        {type: 'doc', id: 'stage-7', label: 'Orbital Maneuvering lab · Scaling'},
      ],
    },
    {
      type: 'category', label: 'Command Module · Security', collapsed: true,
      items: [
        'missions/command-module',
        'learn/security/identity-and-authorization',
        'learn/security/admission-and-runtime',
        'learn/security/network-policy',
        'learn/security/secrets-and-supply-chain',
        'stage-8',
      ],
    },
    {
      type: 'category', label: 'Lunar Orbit · Cloud & Recovery', collapsed: true,
      items: [
        'missions/lunar-orbit',
        'learn/cloud/local-to-cloud',
        'learn/cloud/infrastructure-and-ownership',
        'learn/cloud/topology-scaling-and-upgrades',
        'learn/cloud/backup-restore-and-teardown',
        'stage-9', 'eks',
      ],
    },
    {
      type: 'category', label: 'Capstone · Bring It Together', collapsed: true,
      items: ['learn/capstone/a-booking-through-kubernetes', 'capstone'],
    },
    {
      type: 'category', label: 'Beyond the Mission', collapsed: true,
      items: ['stage-10', 'stage-11', 'status'],
    },
    {
      type: 'category', label: 'Flight Kit & Reference', collapsed: true,
      items: ['labs/setup', 'troubleshooting', 'command-reference', 'glossary'],
    },
  ],
};

export default sidebars;
