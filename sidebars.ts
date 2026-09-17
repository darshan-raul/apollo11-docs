import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  main: [
    {
      type: 'doc',
      id: 'index',
      label: 'Flight Plan & Overview',
    },
    {
      type: 'category',
      label: 'Foundations',
      collapsed: false,
      items: [
        'launchpad',
        'ignition',
      ],
    },
    {
      type: 'category',
      label: 'Core Kubernetes Path',
      collapsed: false,
      items: [
        'stage-1',
        'stage-2',
        'stage-3',
        'stage-4',
        'stage-5',
        'stage-6',
        'stage-7',
      ],
    },
    {
      type: 'category',
      label: 'Research Boundaries & Roadmap',
      collapsed: true,
      items: [
        'eks',
        'stage-8',
        'stage-9',
        'stage-10',
        'stage-11',
      ],
    },
    {
      type: 'category',
      label: 'Operations & Reference',
      collapsed: false,
      items: [
        'capstone',
        'troubleshooting',
        'command-reference',
        'glossary',
      ],
    },
  ],
};

export default sidebars;
