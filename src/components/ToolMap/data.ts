// The tools Apollo11 introduces, grouped the way the course map groups them.
// Logos live in static/img/stack/. A tool without `logo` gets a lettered badge.

export type Tool = {
  name: string;
  role: string;
  href: string;
  logo?: string;
  badge?: string; // short text for the lettered badge
  wide?: boolean; // logo is a wordmark rather than a square icon
};

export type Category = {
  title: string;
  tools: Tool[];
};

export type Zone = {
  title: string;
  blurb: string;
  categories: Category[];
};

export const zones: Zone[] = [
  {
    title: 'Fundamentals',
    blurb: 'What every Kubernetes engineer reaches for: run it, see it, ship it, scale it, secure it.',
    categories: [
      {
        title: 'Networking',
        tools: [
          {name: 'Traefik', role: 'Ingress controller', href: 'https://traefik.io/traefik/', logo: 'traefik.png'},
          {name: 'Linkerd', role: 'Service mesh', href: 'https://linkerd.io/', logo: 'linkerd.svg'},
        ],
      },
      {
        title: 'Observability',
        tools: [
          {name: 'Prometheus', role: 'Metrics', href: 'https://prometheus.io/', logo: 'prometheus.svg'},
          {name: 'OpenTelemetry', role: 'Tracing', href: 'https://opentelemetry.io/', logo: 'opentelemetry.svg'},
          {name: 'Fluent Bit', role: 'Log shipping', href: 'https://fluentbit.io/', logo: 'fluentbit.png', wide: true},
          {name: 'Grafana Loki', role: 'Log storage', href: 'https://grafana.com/oss/loki/', logo: 'loki.png'},
        ],
      },
      {
        title: 'Management tools',
        tools: [
          {name: 'Portainer', role: 'Container management', href: 'https://www.portainer.io/', logo: 'portainer.svg'},
          {name: 'Podman', role: 'Containers', href: 'https://podman.io/', logo: 'podman.svg'},
          {name: 'Tilt', role: 'Local development', href: 'https://tilt.dev/', logo: 'tilt.svg'},
          {name: 'kind', role: 'Local cluster', href: 'https://kind.sigs.k8s.io/', logo: 'kind.png', wide: true},
        ],
      },
      {
        title: 'Visualization',
        tools: [
          {name: 'k9s', role: 'Terminal dashboard', href: 'https://k9scli.io/', logo: 'k9s.png', wide: true},
          {name: 'Headlamp', role: 'UI dashboard', href: 'https://headlamp.dev/', logo: 'headlamp.svg'},
          {name: 'Grafana', role: 'Unified dashboards', href: 'https://grafana.com/oss/grafana/', logo: 'grafana.svg'},
          {name: 'Jaeger', role: 'Tracing dashboard', href: 'https://www.jaegertracing.io/', logo: 'jaeger.svg'},
        ],
      },
      {
        title: 'Packaging and templating',
        tools: [
          {name: 'Kustomize', role: 'Patching', href: 'https://kustomize.io/', logo: 'kustomize.png'},
          {name: 'Helm', role: 'Templating', href: 'https://helm.sh/', logo: 'helm.svg'},
        ],
      },
      {
        title: 'Deployment',
        tools: [
          {name: 'GitHub Actions', role: 'Pipelines', href: 'https://github.com/features/actions', logo: 'github-actions.svg'},
          {name: 'Argo CD', role: 'GitOps', href: 'https://argo-cd.readthedocs.io/', logo: 'argo.svg'},
        ],
      },
      {
        title: 'Scaling',
        tools: [
          {name: 'HPA', role: 'Horizontal Pod scaling', href: 'https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/', logo: 'hpa.png'},
          {name: 'VPA', role: 'Vertical Pod scaling', href: 'https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler', badge: 'VPA'},
        ],
      },
      {
        title: 'Security',
        tools: [
          {name: 'Sealed Secrets', role: 'Encrypted secrets in Git', href: 'https://github.com/bitnami-labs/sealed-secrets', badge: 'SS'},
          {name: 'Open Policy Agent', role: 'Policy as code', href: 'https://www.openpolicyagent.org/', logo: 'opa.png'},
          {name: 'cert-manager', role: 'Certificates', href: 'https://cert-manager.io/', logo: 'cert-manager.svg'},
          {name: 'Trivy', role: 'Vulnerability scanning', href: 'https://trivy.dev/', logo: 'trivy.png'},
        ],
      },
    ],
  },
  {
    title: 'Advanced',
    blurb: 'What a platform team adds once the basics hold: recovery, cost, autoscaling clusters and defence in depth.',
    categories: [
      {
        title: 'Storage',
        tools: [
          {name: 'Velero', role: 'Backup and restore', href: 'https://velero.io/', logo: 'velero.png', wide: true},
          {name: 'Rook', role: 'Storage management', href: 'https://rook.io/', logo: 'rook.svg'},
          {name: 'Harbor', role: 'Artifact registry', href: 'https://goharbor.io/', logo: 'harbor.svg'},
        ],
      },
      {
        title: 'Platform',
        tools: [
          {name: 'Crossplane', role: 'Infrastructure as code', href: 'https://www.crossplane.io/', logo: 'crossplane.svg'},
          {name: 'Kubespray', role: 'Cluster provisioning', href: 'https://kubespray.io/', logo: 'kubespray.svg'},
          {name: 'Slim', role: 'Image minification', href: 'https://github.com/slimtoolkit/slim', logo: 'slimtoolkit.svg'},
          {name: 'Kubeshark', role: 'Traffic analysis', href: 'https://www.kubeshark.co/', logo: 'kubeshark.svg', wide: true},
        ],
      },
      {
        title: 'Progressive delivery',
        tools: [
          {name: 'Argo Rollouts', role: 'Canary and blue-green', href: 'https://argoproj.github.io/rollouts/', logo: 'argo.svg'},
        ],
      },
      {
        title: 'Costs',
        tools: [
          {name: 'OpenCost', role: 'Cost monitoring', href: 'https://www.opencost.io/', logo: 'opencost.png', wide: true},
          {name: 'Goldilocks', role: 'Right-sizing requests', href: 'https://goldilocks.docs.fairwinds.com/', logo: 'goldilocks.svg', wide: true},
        ],
      },
      {
        title: 'Autoscaling and events',
        tools: [
          {name: 'Karpenter', role: 'Cluster autoscaling', href: 'https://karpenter.sh/', logo: 'karpenter.png', wide: true},
          {name: 'KEDA', role: 'Event-driven scaling', href: 'https://keda.sh/', logo: 'keda.svg'},
          {name: 'Argo Events', role: 'Events and webhooks', href: 'https://argoproj.github.io/events/', logo: 'argo.svg'},
          {name: 'Chaos Mesh', role: 'Chaos engineering', href: 'https://chaos-mesh.org/', logo: 'chaosmesh.svg'},
        ],
      },
      {
        title: 'Security',
        tools: [
          {name: 'Keycloak', role: 'Auth provider', href: 'https://www.keycloak.org/', logo: 'keycloak.svg'},
          {name: 'Kubescape', role: 'Benchmarking', href: 'https://kubescape.io/', logo: 'kubescape.svg'},
          {name: 'Vault', role: 'Secrets store', href: 'https://developer.hashicorp.com/vault', logo: 'vault.png'},
          {name: 'TruffleHog', role: 'Secret scanning', href: 'https://trufflesecurity.com/trufflehog', logo: 'trufflehog.png', wide: true},
          {name: 'Falco', role: 'Runtime security', href: 'https://falco.org/', logo: 'falco.svg'},
        ],
      },
    ],
  },
];
