module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'security', 'docs', 'test', 'chore', 'refactor', 'ci', 'style'],
    ],
  },
};
