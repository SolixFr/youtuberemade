import next from 'eslint-config-next';

const config = [
  ...next,
  {
    rules: {
      // Most images are blob: URLs from IndexedDB or local stills, which next/image can't optimise.
      '@next/next/no-img-element': 'off',
    },
  },
  { ignores: ['.next/**', '.next-verify/**', 'public/**', 'node_modules/**'] },
];

export default config;
