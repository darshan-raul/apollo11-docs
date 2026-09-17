import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Apollo 11',
  tagline: '13-stage Kubernetes learning bootstrap',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://apollo11.darshanraul.cloud',
  baseUrl: '/',

  organizationName: 'darshan-raul',
  projectName: 'apollo11-docs',

  onBrokenLinks: 'warn',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'warn',
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
        {to: '/docs/launchpad', label: 'Launchpad', position: 'left'},
        {to: '/docs/ignition', label: 'Ignition', position: 'left'},
        {
          type: 'dropdown',
          label: 'Core Stages',
          position: 'left',
          items: [
            {to: '/docs/stage-1', label: 'Stage 1: Liftoff (Workloads)'},
            {to: '/docs/stage-2', label: 'Stage 2: Guidance (Networking)'},
            {to: '/docs/stage-3', label: 'Stage 3: Mission Data (Storage)'},
            {to: '/docs/stage-4', label: 'Stage 4: Flight Control (Reliability)'},
            {to: '/docs/stage-5', label: 'Stage 5: Packaging (Helm & GitOps)'},
            {to: '/docs/stage-6', label: 'Stage 6: Mission Ops (Observability)'},
            {to: '/docs/stage-7', label: 'Stage 7: Orbital Maneuvering (Scaling)'},
          ],
        },
        {
          type: 'dropdown',
          label: 'Cloud & Roadmaps',
          position: 'left',
          items: [
            {to: '/docs/eks', label: 'Cloud Appendix: Amazon EKS'},
            {to: '/docs/stage-8', label: 'Stage 8: Security (Roadmap)'},
            {to: '/docs/stage-9', label: 'Stage 9: Cloud Ops (Roadmap)'},
            {to: '/docs/stage-10', label: 'Stage 10: Extensions Catalog'},
            {to: '/docs/stage-11', label: 'Stage 11: Towards Mars'},
          ],
        },
        {
          type: 'dropdown',
          label: 'Reference & Labs',
          position: 'left',
          items: [
            {to: '/docs/capstone', label: '🎯 Capstone Challenge'},
            {to: '/docs/troubleshooting', label: '🩺 Troubleshooting Bible'},
            {to: '/docs/command-reference', label: '🧰 Command Cheat Sheet'},
            {to: '/docs/glossary', label: '📖 Kubernetes Glossary'},
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
