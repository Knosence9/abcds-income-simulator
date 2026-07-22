import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const developmentRoutes = {
  name: 'development-routes',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({
          pattern: '/menu-lab',
          entrypoint: './src/dev-pages/menu-lab.astro',
        });
      }
    },
  },
};

export default defineConfig({
  site: 'https://abcds-income-simulator.vercel.app',
  output: 'static',
  integrations: [developmentRoutes, sitemap()],
});
