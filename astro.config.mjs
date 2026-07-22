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
  output: 'static',
  integrations: [developmentRoutes],
});
