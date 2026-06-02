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
  onBrokenMarkdownLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownImages: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

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

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Apollo 11',
      items: [
        {to: '/docs', label: 'Home'},
        {to: '/docs/liftoff', label: 'Launchpad'},
        {to: '/docs/ignition', label: 'Ignition'},
        {to: '/docs/stage-1', label: 'Stage 1'},
        {to: '/docs/stage-2', label: 'Stage 2'},
        {to: '/docs/stage-3', label: 'Stage 3'},
        {to: '/docs/stage-4', label: 'Stage 4'},
        {to: '/docs/stage-5', label: 'Stage 5'},
        {to: '/docs/stage-6', label: 'Stage 6'},
        {to: '/docs/stage-7', label: 'Stage 7'},
        {to: '/docs/stage-8', label: 'Stage 8'},
        {to: '/docs/stage-9', label: 'Stage 9'},
        {to: '/docs/stage-10', label: 'Stage 10'},
        {to: '/docs/stage-11', label: 'Stage 11'},
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
  } satisfies Preset.ThemeConfig,
};

export default config;