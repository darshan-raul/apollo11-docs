import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  main: [
    {
      type: 'doc',
      id: 'index',
      label: 'Home',
    },
    {
      type: 'category',
      label: 'Launchpad',
      items: [
        'launchpad',
      ],
    },
    'ignition',
    'stage-1',
    {
      type: 'category',
      label: 'Stage 2: Guidance',
      items: [
        'stage-2',
        'stage-2/dns',
        'stage-2/services',
        'stage-2/ingress',
        'stage-2/gateway-api',
        'stage-2/networkpolicies',
      ],
    },
    'stage-3',
    'stage-4',
    {
      type: 'category',
      label: 'Stage 5: Payload Integration',
      items: [
        'stage-5',
        'stage-5/helm',
        'stage-5/kustomize',
        'stage-5/argocd',
      ],
    },
    'stage-6',
    'stage-7',
    'stage-8',
    'stage-9',
    'stage-10',
    {
      type: 'category',
      label: 'Stage 11: Towards Mars',
      items: [
        'stage-11',
        'stage-11/k3s-homelab',
      ],
    },
  ],
};

export default sidebars;