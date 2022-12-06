module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {},
  env: {
    node: true,
    es6: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
  ],
  plugins: ['import'],
  rules: {
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        'newlines-between': 'always-and-inside-groups',
      },
    ],
    'no-unused-vars': 'off', // disabled to allow the typescript one to take over and avoid errors in reporting
    '@typescript-eslint/no-unused-vars': ['error'],
    // <TODO> Enable these rules after fixing all existing issues
    '@typescript-eslint/no-use-before-define': 0,
    '@typescript-eslint/indent': 0,
    '@typescript/no-use-before-define': 0,
    '@typescript-eslint/no-var-requires': 0,
    '@typescript-eslint/camelcase': 0,
    '@typescript-eslint/class-name-casing': 0,
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/explicit-function-return-type': 0,
    '@typescript-eslint/explicit-member-accessibility': 0,
    '@typescript-eslint/prefer-interface': 0,
    '@typescript-eslint/no-empty-function': 0,
    '@typescript-eslint/no-this-alias': 0,

    // </TODO>
    'comma-dangle': 0,
    'no-mixed-spaces-and-tabs': 0,
    'no-alert': 0,
    'import/no-named-as-default': 0,
    'import/default': 2,
    'import/named': 2,
    'import/no-unresolved': 2,
    'no-underscore-dangle': 0,
    'no-case-declarations': 0,
    'prefer-const': 0,
    'no-var': 0,
    'prefer-rest-params': 0,
    'prefer-spread': 0,

    strict: 0,
    'no-console': 1,
    'no-trailing-spaces': 2,
  },
};
