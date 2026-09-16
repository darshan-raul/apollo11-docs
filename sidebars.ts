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
      ],
    },
    'stage-3',
    'stage-4',
    {
      type: 'category',
      label: 'Stage 5: Payload Integration',
      items: [
        'stage-5',
      ],
    },
    'stage-6',
    'stage-7',
    'stage-8',
    'stage-9',
    'stage-10',
    {
      type: 'category',
      label: 'Cloud & Optional Missions',
      items: [
        'eks',
        'stage-8',
        'stage-9',
        'stage-10',
        'stage-11',
      ],
    },
  ],
};

export default sidebars;
