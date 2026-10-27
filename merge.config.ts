// Used by `playwright merge-reports` in CI to combine shard blob reports into a
// single HTML report and run AI failure triage once across *all* shards,
// so related failures from different shards can be correlated.
export default {
  testDir: 'tests',
  reporter: [['html', { open: 'never' }], ['./src/ai/ai-triage-reporter.ts']],
};
