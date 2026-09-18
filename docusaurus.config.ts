import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Apollo 11',
  tagline: 'Your Kubernetes mission, from Launchpad to orbit',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://apollo11.darshanraul.cloud',
  baseUrl: '/',

  organizationName: 'darshan-raul',
  projectName: 'apollo11-docs',

  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: ['docusaurus-plugin-image-zoom'],

  themeConfig: {
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Apollo 11',
      items: [
        {to: '/docs', label: 'Flight Plan', position: 'left'},
        {to: '/docs/start/prerequisites', label: 'Start Learning', position: 'left'},
        {
          type: 'dropdown',
          label: 'Mission Stages',
          position: 'left',
          items: [
            {to: '/docs/missions/launchpad', label: 'Launchpad: Containers'},
            {to: '/docs/missions/ignition', label: 'Ignition: First Cluster'},
            {to: '/docs/missions/liftoff', label: 'Stage 1: Liftoff'},
            {to: '/docs/missions/guidance', label: 'Stage 2: Guidance'},
            {to: '/docs/missions/mission-data', label: 'Stage 3: Mission Data'},
            {to: '/docs/missions/flight-control', label: 'Stage 4: Flight Control'},
            {to: '/docs/missions/payload-integration', label: 'Stage 5: Payload Integration'},
            {to: '/docs/missions/mission-operations', label: 'Stage 6: Mission Operations'},
            {to: '/docs/missions/orbital-maneuvering', label: 'Stage 7: Orbital Maneuvering'},
          ],
        },
        {
          type: 'dropdown',
          label: 'Beyond Orbit',
          position: 'left',
          items: [
            {to: '/docs/missions/command-module', label: 'Command Module: Security'},
            {to: '/docs/missions/lunar-orbit', label: 'Lunar Orbit: Cloud & Recovery'},
            {to: '/docs/stage-10', label: 'Mission Extensions'},
            {to: '/docs/stage-11', label: 'Towards Mars'},
            {to: '/docs/status', label: 'Mission Status'},
          ],
        },
        {
          type: 'dropdown',
          label: 'Flight Kit',
          position: 'left',
          items: [
            {to: '/docs/labs/setup', label: 'Prepare Your Launchpad'},
            {to: '/docs/learn/capstone/a-booking-through-kubernetes', label: 'Capstone: Follow a Booking'},
            {to: '/docs/capstone', label: 'Capstone Challenge'},
            {to: '/docs/troubleshooting', label: 'Troubleshooting Bible'},
            {to: '/docs/command-reference', label: 'Command Cheat Sheet'},
            {to: '/docs/glossary', label: 'Kubernetes Glossary'},
          ],
        },
        {
          href: 'https://github.com/darshan-raul/Apollo11',
          label: 'GitHub Lab Repo',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Apollo 11. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    zoom: {
      selector: '.markdown img',
      background: {
        light: 'rgb(255, 255, 255)',
        dark: 'rgb(50, 50, 50)',
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
